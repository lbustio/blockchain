import hashlib
import copy
from backend.blockchain import Blockchain, Block, AcademicTitle

class NodeManager:
    def __init__(self, difficulty: int = 2, initial_blocks: int = 4):
        self.difficulty = difficulty
        self.nodes: dict[str, Blockchain] = {}
        self.node_connections: dict[str, bool] = {}
        self.reset_all_nodes(initial_blocks)

    def reset_all_nodes(self, initial_blocks: int = 4):
        """Reinicia la red con 3 peers sincronizados: Peer_A, Peer_B, Peer_C."""
        # Create the initial blockchain with genesis block
        base_chain = Blockchain(self.difficulty)
        
        # Add initial blocks (optional, 0 for empty ledger)
        for i in range(initial_blocks):
            base_chain.add_block(f"Bloque Inicial {i+1}")
        
        # Create three peers with identical chains
        self.nodes = {
            "Peer_A": copy.deepcopy(base_chain),
            "Peer_B": copy.deepcopy(base_chain),
            "Peer_C": copy.deepcopy(base_chain),
        }
        self.node_connections = {
            "Peer_A": True,
            "Peer_B": True,
            "Peer_C": True,
        }
        self.node_parents = {
            "Peer_A": None,
            "Peer_B": "Peer_A",
            "Peer_C": "Peer_A",
        }

    def get_nodes_status(self) -> dict:
        status = {}
        for node_id, blockchain in self.nodes.items():
            status[node_id] = {
                "chain": [block.to_dict() for block in blockchain.chain],
                "is_valid": blockchain.is_chain_valid(),
                "mempool": blockchain.mempool,
                "titles": blockchain.get_all_titles(),
                "is_online": self.node_connections.get(node_id, True),
                "parent": self.node_parents.get(node_id)
            }
        return status

    def add_node(self, node_id: str, parent_id: str | None = None) -> bool:
        node_id = node_id.strip().replace(" ", "_")
        if not node_id or node_id in self.nodes:
            return False
            
        new_chain = Blockchain(self.difficulty)
        
        # Clone the chain of the node with the highest consensus (majority / valid / longest)
        best_chain = None
        best_len = -1
        for nid, bc in self.nodes.items():
            if self.node_connections.get(nid, True) and bc.is_chain_valid():
                if len(bc.chain) > best_len:
                    best_len = len(bc.chain)
                    best_chain = bc.chain
                    
        if best_chain:
            new_chain.chain = copy.deepcopy(best_chain)
            
        self.nodes[node_id] = new_chain
        self.node_connections[node_id] = True
        # If parent_id is invalid or None, default to Peer_A
        if parent_id and parent_id in self.nodes:
            self.node_parents[node_id] = parent_id
        else:
            self.node_parents[node_id] = "Peer_A"
        return True

    def remove_node(self, node_id: str) -> bool:
        if node_id not in self.nodes:
            return False
        # Prevent removing the last remaining node
        if len(self.nodes) <= 1:
            return False
        # Reparent children to Peer_A before removing
        for child_id in list(self.node_parents.keys()):
            if self.node_parents.get(child_id) == node_id:
                self.node_parents[child_id] = "Peer_A"
        del self.nodes[node_id]
        if node_id in self.node_connections:
            del self.node_connections[node_id]
        if node_id in self.node_parents:
            del self.node_parents[node_id]
        return True

    def toggle_node_connection(self, node_id: str) -> bool:
        if node_id not in self.nodes:
            return False
        self.node_connections[node_id] = not self.node_connections.get(node_id, True)
        return True

    def mine_block_on_node(self, node_id: str, data: str | list = None) -> dict:
        if node_id not in self.nodes:
            return None
        
        blockchain = self.nodes[node_id]
        
        # If no custom data, grab titles from the mempool
        if data is None:
            if not blockchain.mempool:
                data = f"Bloque minado por {node_id} (Sin Títulos)"
            else:
                data = list(blockchain.mempool)
                blockchain.mempool = []
                
        new_block = blockchain.add_block(data)
        return new_block.to_dict()

    def tamper_block_on_node(self, node_id: str, block_index: int, new_data: str | list) -> bool:
        if node_id not in self.nodes:
            return False
        
        # If the input is a string that looks like a simplified title block,
        # we can try to parse it or keep it as a string.
        # But to support visual edits, let's allow editing it directly.
        # If the block originally had structured lists of titles, and they edited it to a string,
        # or we try to keep it structured. Let's support both.
        import json
        parsed_data = new_data
        if isinstance(new_data, str):
            try:
                # If they pasted a json, parse it
                parsed_data = json.loads(new_data)
            except:
                # Otherwise, it's just raw string
                parsed_data = new_data
                
        return self.nodes[node_id].tamper_block(block_index, parsed_data)

    def mine_block_at_index_on_node(self, node_id: str, block_index: int) -> bool:
        if node_id not in self.nodes:
            return False
        return self.nodes[node_id].mine_block_at_index(block_index)

    def add_title_to_node(self, node_id: str, title_data: dict, broadcast: bool = True) -> dict:
        title = AcademicTitle.from_dict(title_data).to_dict()
        
        if broadcast:
            for nid, node in self.nodes.items():
                if self.node_connections.get(nid, True):
                    node.mempool.append(title)
        else:
            if node_id in self.nodes and self.node_connections.get(node_id, True):
                self.nodes[node_id].mempool.append(title)
        return title

    def simulate_51_percent_attack(self, block_index: int, forged_student: str, forged_degree: str, forged_id: str) -> dict:
        """
        Simula un ataque del 51% coordinando una alteración en la mayoría de los nodos.
        Altera y vuelve a minar en más de la mitad de la red para que sean válidos localmente
        pero con datos falsos — suficientes para ganar el algoritmo de consenso.
        """
        forged_data = [{
            "student": forged_student,
            "degree": forged_degree,
            "university": "Univ. Forjada (Institución Falsa)",
            "date": "2026-06-24",
            "title_id": forged_id
        }]

        # Calcular la mayoría: más de la mitad de los nodos totales
        all_node_ids = list(self.nodes.keys())
        total_nodes = len(all_node_ids)
        majority_needed = (total_nodes // 2) + 1

        # Los nodos atacantes son todos excepto el líder (Peer_A)
        # Tomamos los que sean suficientes para superar la mayoría
        attack_targets = [nid for nid in all_node_ids if nid != "Peer_A"][:majority_needed]

        attacked_nodes = []
        for node_id in attack_targets:
            blockchain = self.nodes[node_id]
            if block_index >= len(blockchain.chain):
                continue
            
            # 1. Alterar datos en el bloque objetivo
            blockchain.tamper_block(block_index, forged_data)
            
            # 2. Re-minar el bloque alterado y TODOS los posteriores (cadena válida localmente)
            for i in range(block_index, len(blockchain.chain)):
                blockchain.mine_block_at_index(i)
            
            attacked_nodes.append(node_id)

        return {
            "message": f"Ataque del 51% ejecutado en {len(attacked_nodes)}/{total_nodes} nodos ({', '.join(attacked_nodes)}). Estos nodos tienen cadenas válidas localmente con datos falsos.",
            "attacked_nodes": attacked_nodes,
            "nodes": self.get_nodes_status()
        }

    def resolve_consensus(self) -> tuple[bool, list[str] | str]:
        # 1. Gather all valid chains from ONLINE nodes
        valid_chains: list[tuple[str, list[Block]]] = []
        for node_id, blockchain in self.nodes.items():
            if self.node_connections.get(node_id, True) and blockchain.is_chain_valid():
                valid_chains.append((node_id, blockchain.chain))
                
        if not valid_chains:
            return False, "No hay ninguna cadena válida en la red online. ¡Consenso imposible!"

        # 2. Find the consensus chain
        chain_signatures = {} # signature -> (chain, count, list of node_ids)
        
        for node_id, chain in valid_chains:
            sig = hashlib.sha256("".join([b.hash for b in chain]).encode('utf-8')).hexdigest()
            if sig not in chain_signatures:
                chain_signatures[sig] = (chain, 1, [node_id])
            else:
                curr_chain, count, nodes = chain_signatures[sig]
                chain_signatures[sig] = (curr_chain, count + 1, nodes + [node_id])

        # Pick the chain representing the majority (most votes; tiebreak by longest)
        majority_sig = None
        max_count = -1
        max_len = -1
        
        for sig, (chain, count, nodes) in chain_signatures.items():
            chain_len = len(chain)
            if count > max_count or (count == max_count and chain_len > max_len):
                max_count = count
                max_len = chain_len
                majority_sig = sig
                
        consensus_chain = chain_signatures[majority_sig][0]
        
        # 3. Synchronize all ONLINE nodes
        synced_nodes = []
        consensus_sig_hashes = "".join([b.hash for b in consensus_chain])
        consensus_sig = hashlib.sha256(consensus_sig_hashes.encode('utf-8')).hexdigest()
        
        for node_id, blockchain in self.nodes.items():
            if not self.node_connections.get(node_id, True):
                continue
                
            current_sig = hashlib.sha256("".join([b.hash for b in blockchain.chain]).encode('utf-8')).hexdigest()
            
            if current_sig != consensus_sig or not blockchain.is_chain_valid():
                blockchain.chain = copy.deepcopy(consensus_chain)
                synced_nodes.append(node_id)
                
        return True, synced_nodes

    def change_difficulty(self, new_difficulty: int):
        if new_difficulty < 1 or new_difficulty > 4:
            return False
        self.difficulty = new_difficulty
        for blockchain in self.nodes.values():
            blockchain.difficulty = new_difficulty
        return True

    def remove_block_on_node(self, node_id: str, block_index: int) -> bool:
        if node_id not in self.nodes:
            return False
        return self.nodes[node_id].remove_block(block_index)

    def save_state(self) -> dict:
        return {
            "difficulty": self.difficulty,
            "nodes": {nid: bc.serialize() for nid, bc in self.nodes.items()},
            "node_connections": dict(self.node_connections),
            "node_parents": dict(self.node_parents),
        }

    @staticmethod
    def load_state(data: dict):
        nm = object.__new__(NodeManager)
        nm.difficulty = data["difficulty"]
        nm.nodes = {}
        for nid, bc_data in data["nodes"].items():
            nm.nodes[nid] = Blockchain.deserialize(bc_data)
        nm.node_connections = dict(data.get("node_connections", {}))
        nm.node_parents = dict(data.get("node_parents", {nid: "Peer_A" for nid in nm.nodes}))
        return nm

    def add_custom_block_on_node(self, node_id: str, data: str | list, mine: bool = True) -> dict:
        if node_id not in self.nodes:
            return None
        import json
        parsed_data = data
        if isinstance(data, str):
            try:
                parsed_data = json.loads(data)
            except:
                parsed_data = data
        new_block = self.nodes[node_id].add_custom_block(parsed_data, mine=mine)
        return new_block.to_dict()
