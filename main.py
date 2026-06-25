import os
import json
import hashlib
from fastapi import FastAPI, HTTPException, APIRouter
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from backend.node_manager import NodeManager
import uvicorn

app = FastAPI(
    title="Demo Educativa de Blockchain (BlockLearn)",
    description="Backend educativo para ilustrar los conceptos de Blockchain e Integridad de Datos (Títulos Académicos) y simular ataques de red."
)

managers = {
    "chain": NodeManager(difficulty=2),
    "attack": NodeManager(difficulty=2),
    "ledger": NodeManager(difficulty=2, initial_blocks=0),
}

# Modelos Pydantic
class AcademicTitleModel(BaseModel):
    student: str = Field(..., min_length=1)
    degree: str = Field(..., min_length=1)
    university: str = Field(..., min_length=1)
    date: str = Field(..., min_length=1)
    title_id: str = Field(..., min_length=1)
    node_id: str = "Peer_A"
    broadcast: bool = True

class TamperModel(BaseModel):
    block_index: int
    new_data: str

class MineBlockIndexModel(BaseModel):
    block_index: int

class DifficultyModel(BaseModel):
    difficulty: int = Field(..., ge=1, le=4)

class MineBlockModel(BaseModel):
    data: str | None = None

class Attack51Model(BaseModel):
    block_index: int = Field(..., ge=1)
    forged_student: str = Field(..., min_length=1)
    forged_degree: str = Field(..., min_length=1)
    forged_id: str = Field(..., min_length=1)

class AddNodeModel(BaseModel):
    node_id: str = Field(..., min_length=1)
    parent_id: str | None = None

class CreateBlockModel(BaseModel):
    data: str
    mine: bool = True

class SaveLedgerModel(BaseModel):
    filename: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)

class LoadLedgerModel(BaseModel):
    filename: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)

# ─── Cifrado ──────────────────────────────
DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

def _derive_keystream(key: bytes, length: int) -> bytes:
    ks = b""
    c = 0
    while len(ks) < length:
        ks += hashlib.sha256(key + str(c).encode()).digest()
        c += 1
    return ks[:length]

def encrypt_blob(plaintext: str, password: str) -> bytes:
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    pt = plaintext.encode("utf-8")
    stream = _derive_keystream(key, len(pt))
    cipher = bytes(a ^ b for a, b in zip(pt, stream))
    checksum = hashlib.sha256(pt).hexdigest()
    return salt + checksum.encode() + cipher

def decrypt_blob(data: bytes, password: str) -> str:
    salt = data[:16]
    checksum = data[16:80].decode()
    cipher = data[80:]
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    stream = _derive_keystream(key, len(cipher))
    pt = bytes(a ^ b for a, b in zip(cipher, stream))
    if hashlib.sha256(pt).hexdigest() != checksum:
        raise ValueError("Contraseña incorrecta o archivo corrupto")
    return pt.decode("utf-8")

def create_scope_router(scope: str):
    router = APIRouter(prefix=f"/api/{scope}")
    m = managers[scope]

    @router.get("/status")
    def get_status():
        return {"difficulty": m.difficulty, "nodes": m.get_nodes_status()}

    @router.post("/nodes/{node_id}/mine")
    def mine_block(node_id: str, payload: MineBlockModel = None):
        if node_id not in m.nodes:
            raise HTTPException(status_code=404, detail="Nodo no encontrado")
        data = payload.data if payload else None
        block = m.mine_block_on_node(node_id, data=data)
        return {
            "message": f"Bloque minado exitosamente en {node_id}",
            "block": block,
            "nodes": m.get_nodes_status()
        }

    @router.post("/nodes/{node_id}/tamper")
    def tamper_block(node_id: str, payload: TamperModel):
        if node_id not in m.nodes:
            raise HTTPException(status_code=404, detail="Nodo no encontrado")
        success = m.tamper_block_on_node(node_id, payload.block_index, payload.new_data)
        if not success:
            raise HTTPException(status_code=400, detail="Índice de bloque inválido o error al alterar")
        return {
            "message": f"Bloque {payload.block_index} alterado en {node_id}. La cadena ahora está rota.",
            "nodes": m.get_nodes_status()
        }

    @router.post("/nodes/{node_id}/mine_block_index")
    def mine_block_index(node_id: str, payload: MineBlockIndexModel):
        if node_id not in m.nodes:
            raise HTTPException(status_code=404, detail="Nodo no encontrado")
        success = m.mine_block_at_index_on_node(node_id, payload.block_index)
        if not success:
            raise HTTPException(status_code=400, detail="Error al minar el bloque especificado")
        return {
            "message": f"Bloque {payload.block_index} reminado en {node_id}.",
            "nodes": m.get_nodes_status()
        }

    @router.post("/titles")
    def add_title(title: AcademicTitleModel):
        if title.node_id not in m.nodes:
            raise HTTPException(status_code=404, detail="Nodo origen no encontrado")
        title_data = {
            "student": title.student, "degree": title.degree,
            "university": title.university, "date": title.date,
            "title_id": title.title_id
        }
        added_title = m.add_title_to_node(title.node_id, title_data, broadcast=title.broadcast)
        return {
            "message": "Título añadido a la bandeja de firma exitosamente",
            "title": added_title,
            "nodes": m.get_nodes_status()
        }

    @router.post("/consensus")
    def run_consensus():
        success, result = m.resolve_consensus()
        if not success:
            raise HTTPException(status_code=400, detail=result)
        return {
            "message": "Consenso de red ejecutado",
            "synced_nodes": result,
            "nodes": m.get_nodes_status()
        }

    @router.post("/difficulty")
    def change_difficulty(payload: DifficultyModel):
        success = m.change_difficulty(payload.difficulty)
        if not success:
            raise HTTPException(status_code=400, detail="Dificultad inválida (debe ser entre 1 y 4)")
        return {
            "message": f"Dificultad de la red cambiada a {payload.difficulty}",
            "difficulty": m.difficulty,
            "nodes": m.get_nodes_status()
        }

    @router.post("/attacks/51percent")
    def run_51percent_attack(payload: Attack51Model):
        return m.simulate_51_percent_attack(
            block_index=payload.block_index,
            forged_student=payload.forged_student,
            forged_degree=payload.forged_degree,
            forged_id=payload.forged_id
        )

    @router.post("/nodes")
    def add_new_node(payload: AddNodeModel):
        success = m.add_node(payload.node_id, parent_id=payload.parent_id)
        if not success:
            raise HTTPException(status_code=400, detail="El nombre del nodo ya existe o no es válido")
        return {
            "message": f"Nodo {payload.node_id} agregado exitosamente",
            "nodes": m.get_nodes_status()
        }

    @router.delete("/nodes/{node_id}")
    def remove_node(node_id: str):
        success = m.remove_node(node_id)
        if not success:
            raise HTTPException(status_code=400, detail="No se puede eliminar el nodo (el último nodo no puede ser eliminado)")
        return {
            "message": f"Nodo {node_id} eliminado de la red",
            "nodes": m.get_nodes_status()
        }

    @router.post("/nodes/{node_id}/toggle_connection")
    def toggle_connection(node_id: str):
        success = m.toggle_node_connection(node_id)
        if not success:
            raise HTTPException(status_code=404, detail="Nodo no encontrado")
        state = "online" if m.node_connections.get(node_id, True) else "offline"
        return {
            "message": f"Nodo {node_id} ahora está {state}",
            "nodes": m.get_nodes_status()
        }

    @router.post("/nodes/{node_id}/blocks/create")
    def create_block_manual(node_id: str, payload: CreateBlockModel):
        if node_id not in m.nodes:
            raise HTTPException(status_code=404, detail="Nodo no encontrado")
        block = m.add_custom_block_on_node(node_id, payload.data, mine=payload.mine)
        status = "minado y válido" if payload.mine else "añadido sin minar (inválido)"
        return {
            "message": f"Bloque manual {status} en {node_id}",
            "block": block,
            "nodes": m.get_nodes_status()
        }

    @router.delete("/nodes/{node_id}/blocks/{index}")
    def remove_block_manual(node_id: str, index: int):
        if node_id not in m.nodes:
            raise HTTPException(status_code=404, detail="Nodo no encontrado")
        success = m.remove_block_on_node(node_id, index)
        if not success:
            raise HTTPException(status_code=400, detail="No se pudo eliminar el bloque (génesis no puede ser eliminado o índice inválido)")
        return {
            "message": f"Bloque #{index} eliminado en {node_id}. Cadena re-enlazada pero con hashes rotos.",
            "nodes": m.get_nodes_status()
        }

    @router.post("/reset")
    def reset_scope():
        m.reset_all_nodes(0 if scope == "ledger" else 4)
        return {
            "message": f"Simulación {scope} reiniciada a su estado inicial",
            "nodes": m.get_nodes_status()
        }

    return router

for scope in ["chain", "attack", "ledger"]:
    app.include_router(create_scope_router(scope))

# ─── Persistencia del Ledger (cifrada) ────
@app.post("/api/ledger/save")
def save_ledger(payload: SaveLedgerModel):
    mgr = managers["ledger"]
    state_json = json.dumps(mgr.save_state(), indent=2, ensure_ascii=False)
    encrypted = encrypt_blob(state_json, payload.password)
    filepath = os.path.join(DATA_DIR, f"{payload.filename}.blk")
    with open(filepath, "wb") as f:
        f.write(encrypted)
    return {"message": f"Ledger guardado como {payload.filename}.blk"}

@app.post("/api/ledger/load")
def load_ledger(payload: LoadLedgerModel):
    filepath = os.path.join(DATA_DIR, f"{payload.filename}.blk")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    with open(filepath, "rb") as f:
        encrypted = f.read()
    try:
        state_json = decrypt_blob(encrypted, payload.password)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    state = json.loads(state_json)
    loaded = NodeManager.load_state(state)
    mgr = managers["ledger"]
    mgr.nodes = loaded.nodes
    mgr.difficulty = loaded.difficulty
    mgr.node_connections = loaded.node_connections
    mgr.node_parents = loaded.node_parents
    return {
        "message": f"Ledger cargado desde {payload.filename}.blk",
        "nodes": mgr.get_nodes_status(),
        "difficulty": mgr.difficulty,
    }

@app.get("/api/ledger/saves")
def list_ledger_saves():
    files = []
    for fname in os.listdir(DATA_DIR):
        if fname.endswith(".blk"):
            files.append(fname[:-4])
    return {"saves": sorted(files)}

# Legacy aliases for backward compatibility (chain scope)
@app.get("/api/status")
def legacy_status():
    m = managers["chain"]
    return {"difficulty": m.difficulty, "nodes": m.get_nodes_status()}

@app.post("/api/reset")
def legacy_reset():
    for key, m in managers.items():
        m.reset_all_nodes(0 if key == "ledger" else 4)
    m = managers["chain"]
    return {"message": "Todas las simulaciones reiniciadas", "nodes": m.get_nodes_status()}

@app.post("/api/difficulty")
def legacy_difficulty(payload: DifficultyModel):
    for m in managers.values():
        m.change_difficulty(payload.difficulty)
    return {
        "message": f"Dificultad global cambiada a {payload.difficulty}",
        "difficulty": payload.difficulty,
        "nodes": managers["chain"].get_nodes_status()
    }

os.makedirs("frontend", exist_ok=True)

@app.get("/")
def get_index():
    index_path = os.path.join("frontend", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Directorio frontend inicializado. Crea index.html en él."}

app.mount("/", StaticFiles(directory="frontend"), name="frontend")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
