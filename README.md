# BlockLearn — Demo Educativa de Blockchain

Herramienta interactiva para aprender los conceptos fundamentales de blockchain en el contexto de un **registro de títulos académicos**. Desarrollada para docentes y estudiantes que quieran explorar criptografía, inmutabilidad de datos y consenso de red de forma práctica, sin necesidad de conocimientos previos.

---

## Capturas

> *Una app de una sola página con 5 módulos interactivos progresivos.*

| Tab 1 — Hash SHA-256 | Tab 3 — Cadena de bloques |
|---|---|
| Explora el efecto avalancha en tiempo real | Edita datos y observa cómo se rompe la cadena |

---

## Características

- **5 módulos didácticos** en progresión lógica: Hash → Bloque → Cadena → Red → Registro
- **Proof of Work** visual: observa la búsqueda de nonce iteración a iteración (modo paso a paso o automático)
- **Red de 3 nodos** (Univ. Complutense, Barcelona, Valencia) con cadenas sincronizadas
- **Laboratorio de ataques**: alteración de datos, reminado local y ataque del 51%
- **Algoritmo de consenso** por mayoría con tiebreak por cadena más larga
- **Registro de títulos académicos**: emisión → mempool → minado → verificación criptográfica
- **Persistencia cifrada**: guarda y carga el ledger con contraseña (PBKDF2 + XOR stream cipher)
- **Nodos dinámicos**: añade y elimina nodos en tiempo de ejecución
- **Dificultad ajustable** (1–4 ceros): impacto inmediato en todos los scopes

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.12+, [FastAPI](https://fastapi.tiangolo.com/), Uvicorn |
| Frontend | HTML5, CSS3, JavaScript ES2022 (vanilla) |
| Iconos | [Lucide](https://lucide.dev/) |
| Tipografía | Inter + Fira Code (Google Fonts) |
| Criptografía | SHA-256 (Web Crypto API en frontend · `hashlib` en backend) |
| Cifrado de archivos | PBKDF2-HMAC-SHA256 + keystream XOR |

---

## Estructura del proyecto

```
blockchain/
├── main.py                  # Servidor FastAPI + endpoints REST
├── requirements.txt
├── data/                    # Archivos .blk (ledgers cifrados)
├── backend/
│   ├── blockchain.py        # Clases Block y Blockchain
│   └── node_manager.py      # Red de nodos, consenso y ataques
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js               # Lógica de UI y comunicación con la API
```

---

## Instalación y arranque

### Requisitos

- Python 3.12 o superior
- pip

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/blocklearn.git
cd blocklearn

# 2. Crear entorno virtual (recomendado)
python -m venv .venv
source .venv/bin/activate      # Linux / macOS
.venv\Scripts\activate         # Windows

# 3. Instalar dependencias
pip install -r requirements.txt

# 4. Arrancar el servidor
python main.py
```

Abre el navegador en **http://127.0.0.1:8000**

---

## Módulos de aprendizaje

### 1. Función Hash (SHA-256)
Escribe cualquier texto y observa en tiempo real cómo cambia el hash. Demuestra las tres propiedades clave: determinismo, efecto avalancha e irreversibilidad.

### 2. El Bloque
Anatomía completa de un bloque: índice, timestamp, datos, previous hash y nonce. Mina el bloque manualmente (paso a paso o automático) para entender el Proof of Work.

### 3. Cadena de Bloques
Tres nodos universitarios con cadenas idénticas. Edita los datos de cualquier bloque y observa el efecto dominó que rompe todos los bloques posteriores. Incluye selector de nodo, añadir/eliminar nodos y creación manual de bloques.

### 4. Ataques y Consenso
Laboratorio de tres ataques progresivos:

| Ataque | Descripción | Resultado tras consenso |
|--------|-------------|------------------------|
| **01 — Alteración** | Modifica datos en Nodo B | Cadena rota → consenso la corrige |
| **02 — Reminado local** | Altera + remina en Nodo B | Cadena válida localmente pero hashes divergen → consenso detecta fraude |
| **03 — 51%** | Toma la mayoría de nodos con datos falsos | Consenso acepta la mentira → nodo honesto sobrescrito |

### 5. Registro de Títulos
Ciclo de vida completo de un diploma en blockchain:
1. **Emitir** — rellena los datos del graduado y firma (envía al mempool)
2. **Minar** — elige el nodo institución y sella los títulos en un bloque
3. **Verificar** — busca por nombre o ID de título; muestra alerta de fraude si la cadena está comprometida

---

## API REST

El backend expone endpoints bajo tres scopes independientes: `chain`, `attack` y `ledger`.

```
GET  /api/{scope}/status
POST /api/{scope}/nodes/{node_id}/mine
POST /api/{scope}/nodes/{node_id}/tamper
POST /api/{scope}/nodes/{node_id}/mine_block_index
POST /api/{scope}/nodes/{node_id}/toggle_connection
POST /api/{scope}/nodes/{node_id}/blocks/create
DEL  /api/{scope}/nodes/{node_id}/blocks/{index}
POST /api/{scope}/nodes
DEL  /api/{scope}/nodes/{node_id}
POST /api/{scope}/consensus
POST /api/{scope}/reset
POST /api/{scope}/difficulty

POST /api/ledger/titles
POST /api/ledger/save
POST /api/ledger/load
GET  /api/ledger/saves
```

Documentación interactiva disponible en **http://127.0.0.1:8000/docs** (Swagger UI).

---

## Conceptos de blockchain cubiertos

- **SHA-256** y propiedades criptográficas
- **Proof of Work** y dificultad de minado
- **Estructura de bloque** (índice, timestamp, datos, previous hash, nonce, hash)
- **Encadenamiento criptográfico** e inmutabilidad
- **Red P2P** y replicación de estado
- **Algoritmo de consenso** por mayoría (Nakamoto-style)
- **Ataque del 51%** y sus límites
- **Merkle-style** verificación de integridad de credenciales

---

## Licencia

MIT License — libre para uso educativo, docente e investigación.
