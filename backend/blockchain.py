import hashlib
import json
import time

class AcademicTitle:
    def __init__(self, student: str, degree: str, university: str, date: str, title_id: str):
        self.student = student
        self.degree = degree
        self.university = university
        self.date = date
        self.title_id = title_id

    def to_dict(self):
        return {
            "student": self.student,
            "degree": self.degree,
            "university": self.university,
            "date": self.date,
            "title_id": self.title_id
        }

    @staticmethod
    def from_dict(data: dict):
        return AcademicTitle(
            student=data.get("student", ""),
            degree=data.get("degree", ""),
            university=data.get("university", ""),
            date=data.get("date", ""),
            title_id=data.get("title_id", "")
        )

class Block:
    def __init__(self, index: int, timestamp: int | float, data: str | list, previous_hash: str, nonce: int = 0):
        self.index = index
        self.timestamp = int(timestamp)
        self.data = data
        self.previous_hash = previous_hash
        self.nonce = nonce
        self.hash = self.calculate_hash()

    def calculate_hash(self) -> str:
        # Normalize data to a string for consistent hashing
        if isinstance(self.data, list):
            # Sort keys in dicts to ensure deterministic JSON serialization
            normalized_list = []
            for item in self.data:
                if isinstance(item, dict):
                    normalized_list.append(item)
                elif hasattr(item, "to_dict"):
                    normalized_list.append(item.to_dict())
                else:
                    normalized_list.append(item)
            serialized_data = json.dumps(normalized_list, sort_keys=True)
        else:
            serialized_data = str(self.data)

        block_string = f"{self.index}{self.timestamp}{serialized_data}{self.previous_hash}{self.nonce}"
        return hashlib.sha256(block_string.encode('utf-8')).hexdigest()

    def mine_block(self, difficulty: int):
        target = "0" * difficulty
        self.nonce = 0
        self.hash = self.calculate_hash()
        while self.hash[:difficulty] != target:
            self.nonce += 1
            self.hash = self.calculate_hash()

    def to_dict(self):
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "data": self.data,
            "previous_hash": self.previous_hash,
            "nonce": self.nonce,
            "hash": self.hash
        }

    @staticmethod
    def from_dict(data: dict):
        block = object.__new__(Block)
        block.index = data["index"]
        block.timestamp = data["timestamp"]
        block.data = data["data"]
        block.previous_hash = data["previous_hash"]
        block.nonce = data["nonce"]
        block.hash = data["hash"]
        return block

class Blockchain:
    def __init__(self, difficulty: int = 2):
        self.chain: list[Block] = []
        self.difficulty = difficulty
        self.mempool: list[dict] = []
        self.create_genesis_block()

    def create_genesis_block(self):
        # Deterministic genesis block for visual ease
        genesis_block = Block(0, 1719266400, "Bloque Génesis - Registro de Títulos Académicos", "0" * 64, 0)
        genesis_block.mine_block(self.difficulty)
        self.chain.append(genesis_block)

    def get_latest_block(self) -> Block:
        return self.chain[-1]

    def add_block(self, data: str | list) -> Block:
        latest = self.get_latest_block()
        new_block = Block(
            index=latest.index + 1,
            timestamp=int(time.time()),
            data=data,
            previous_hash=latest.hash,
            nonce=0
        )
        new_block.mine_block(self.difficulty)
        self.chain.append(new_block)
        return new_block

    def add_custom_block(self, data: str | list, mine: bool = True) -> Block:
        latest = self.get_latest_block()
        new_block = Block(
            index=latest.index + 1,
            timestamp=int(time.time()),
            data=data,
            previous_hash=latest.hash,
            nonce=0
        )
        if mine:
            new_block.mine_block(self.difficulty)
        else:
            new_block.hash = new_block.calculate_hash()
        self.chain.append(new_block)
        return new_block

    def remove_block(self, index: int) -> bool:
        if index <= 0 or index >= len(self.chain):
            return False
        
        self.chain.pop(index)
        
        # Re-index and link subsequent blocks
        for i in range(index, len(self.chain)):
            self.chain[i].index = i
            self.chain[i].previous_hash = self.chain[i-1].hash
            self.chain[i].hash = self.chain[i].calculate_hash()
            
        return True

    def tamper_block(self, index: int, new_data: str | list):
        if index < 0 or index >= len(self.chain):
            return False
        
        self.chain[index].data = new_data
        # Recalculate hash for the tampered block
        self.chain[index].hash = self.chain[index].calculate_hash()
        
        # Propagate the change downstream
        for i in range(index + 1, len(self.chain)):
            self.chain[i].previous_hash = self.chain[i-1].hash
            self.chain[i].hash = self.chain[i].calculate_hash()
            
        return True

    def mine_block_at_index(self, index: int):
        if index < 0 or index >= len(self.chain):
            return False
        
        # Remine the specific block
        self.chain[index].mine_block(self.difficulty)
        
        # Propagate the new hash downstream (recalculates hashes but doesn't remine)
        # so downstream blocks become invalid — user must mine each one manually
        for i in range(index + 1, len(self.chain)):
            self.chain[i].previous_hash = self.chain[i-1].hash
            self.chain[i].hash = self.chain[i].calculate_hash()
            
        return True

    def is_chain_valid(self) -> bool:
        target = "0" * self.difficulty
        
        # Check genesis block
        genesis = self.chain[0]
        if genesis.hash != genesis.calculate_hash():
            return False
        if genesis.hash[:self.difficulty] != target:
            return False

        # Check subsequent blocks
        for i in range(1, len(self.chain)):
            current = self.chain[i]
            previous = self.chain[i-1]

            if current.hash != current.calculate_hash():
                return False
            if current.previous_hash != previous.hash:
                return False
            if current.hash[:self.difficulty] != target:
                return False

        return True

    def get_all_titles(self) -> dict[str, dict]:
        titles = {}
        for block in self.chain:
            if isinstance(block.data, list):
                for item in block.data:
                    title_id = item.get("title_id")
                    if title_id:
                        titles[title_id] = item
        return titles

    def serialize(self) -> dict:
        return {
            "difficulty": self.difficulty,
            "chain": [b.to_dict() for b in self.chain],
            "mempool": self.mempool,
        }

    @staticmethod
    def deserialize(data: dict):
        bc = object.__new__(Blockchain)
        bc.difficulty = data["difficulty"]
        bc.chain = [Block.from_dict(b) for b in data["chain"]]
        bc.mempool = data.get("mempool", [])
        return bc
