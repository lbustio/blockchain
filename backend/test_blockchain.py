import unittest
import copy
from backend.blockchain import Blockchain, Block
from backend.node_manager import NodeManager

class TestBlockchain(unittest.TestCase):
    def test_block_hashing(self):
        block = Block(1, 1600000000.0, "Test Data", "0"*64, 123)
        h = block.calculate_hash()
        self.assertEqual(block.hash, h)
        
        # Changing data changes hash
        block.data = "Modified Data"
        self.assertNotEqual(block.hash, block.calculate_hash())

    def test_mining(self):
        difficulty = 2
        block = Block(1, 1600000000.0, "Test Data", "0"*64, 0)
        block.mine_block(difficulty)
        
        self.assertTrue(block.hash.startswith("00"))
        self.assertEqual(block.hash, block.calculate_hash())

    def test_chain_validation(self):
        blockchain = Blockchain(difficulty=2)
        self.assertTrue(blockchain.is_chain_valid())
        
        blockchain.add_block("Block 1 Data")
        blockchain.add_block("Block 2 Data")
        self.assertTrue(blockchain.is_chain_valid())

    def test_tampering(self):
        blockchain = Blockchain(difficulty=2)
        blockchain.add_block("Original Data 1")
        blockchain.add_block("Original Data 2")
        self.assertTrue(blockchain.is_chain_valid())
        
        # Tamper Block 1
        blockchain.tamper_block(1, "Tampered Data 1")
        
        # The chain should now be invalid
        self.assertFalse(blockchain.is_chain_valid())

    def test_remine(self):
        blockchain = Blockchain(difficulty=2)
        blockchain.add_block("Original Data 1")
        blockchain.add_block("Original Data 2")
        self.assertTrue(blockchain.is_chain_valid())
        
        # Tamper Block 1
        blockchain.tamper_block(1, "Tampered Data 1")
        self.assertFalse(blockchain.is_chain_valid())
        
        # Remining block 1 fixes block 1 but downstream only recalculates (not remined)
        blockchain.mine_block_at_index(1)
        # Block 2's previous_hash changed, so chain is still invalid
        self.assertFalse(blockchain.is_chain_valid())
        
        # Remining block 2 makes the entire chain valid again
        blockchain.mine_block_at_index(2)
        self.assertTrue(blockchain.is_chain_valid())

    def test_remove_block(self):
        blockchain = Blockchain(difficulty=2)
        blockchain.add_block("Block 1")
        blockchain.add_block("Block 2")
        blockchain.add_block("Block 3")
        self.assertTrue(blockchain.is_chain_valid())
        self.assertEqual(len(blockchain.chain), 4) # Genesis + 3 blocks
        
        # Remove Block 2
        success = blockchain.remove_block(2)
        self.assertTrue(success)
        self.assertEqual(len(blockchain.chain), 3)
        # Block in index 2 (formerly Block 3) should now have index=2 and previous_hash pointing to Block 1
        self.assertEqual(blockchain.chain[2].index, 2)
        self.assertEqual(blockchain.chain[2].previous_hash, blockchain.chain[1].hash)
        # The chain should now be invalid because block 2's hash doesn't solve Proof of Work (it was updated but not mined)
        self.assertFalse(blockchain.is_chain_valid())
        
        # After remining index 2, the chain should be valid again
        blockchain.mine_block_at_index(2)
        self.assertTrue(blockchain.is_chain_valid())

    def test_add_custom_block(self):
        blockchain = Blockchain(difficulty=2)
        # Add custom block without mining
        block = blockchain.add_custom_block("Unmined block", mine=False)
        self.assertEqual(len(blockchain.chain), 2)
        self.assertFalse(blockchain.is_chain_valid()) # Invalid because it was not mined
        
        # Add custom block with mining
        blockchain2 = Blockchain(difficulty=2)
        block2 = blockchain2.add_custom_block("Mined block", mine=True)
        self.assertTrue(blockchain2.is_chain_valid()) # Valid because it was mined

class TestNodeManager(unittest.TestCase):
    def test_initial_sync(self):
        manager = NodeManager(difficulty=2)
        status = manager.get_nodes_status()
        
        # Nodes should be valid and synced
        self.assertTrue(status["Peer_A"]["is_valid"])
        self.assertTrue(status["Peer_B"]["is_valid"])
        self.assertTrue(status["Peer_C"]["is_valid"])
        
        self.assertEqual(status["Peer_A"]["chain"], status["Peer_B"]["chain"])
        self.assertEqual(status["Peer_A"]["chain"], status["Peer_C"]["chain"])

    def test_tamper_and_consensus(self):
        manager = NodeManager(difficulty=2)
        
        # Tamper Peer B
        manager.tamper_block_on_node("Peer_B", 1, "Ataque Malicioso")
        status = manager.get_nodes_status()
        
        self.assertTrue(status["Peer_A"]["is_valid"])
        self.assertFalse(status["Peer_B"]["is_valid"])
        self.assertTrue(status["Peer_C"]["is_valid"])
        
        # Consensus should sync Peer B back to matching Peer A & C
        success, result = manager.resolve_consensus()
        self.assertTrue(success)
        self.assertEqual(result, ["Peer_B"])
        
        status_after = manager.get_nodes_status()
        self.assertTrue(status_after["Peer_B"]["is_valid"])
        self.assertEqual(status_after["Peer_A"]["chain"], status_after["Peer_B"]["chain"])

    def test_dynamic_nodes_and_connection(self):
        manager = NodeManager(difficulty=2)
        
        # Add a node
        success = manager.add_node("Peer_D")
        self.assertTrue(success)
        status = manager.get_nodes_status()
        self.assertIn("Peer_D", status)
        self.assertTrue(status["Peer_D"]["is_valid"])
        self.assertTrue(status["Peer_D"]["is_online"])
        self.assertEqual(status["Peer_D"]["chain"], status["Peer_A"]["chain"])
        
        # Toggle node connection (disconnect)
        success_toggle = manager.toggle_node_connection("Peer_D")
        self.assertTrue(success_toggle)
        status = manager.get_nodes_status()
        self.assertFalse(status["Peer_D"]["is_online"])
        
        # Add block via broadcast
        title_data = {
            "student": "Eve White",
            "degree": "Física",
            "university": "Univ. de Madrid",
            "date": "2026-06-20",
            "title_id": "TIT-99999"
        }
        manager.add_title_to_node("Peer_A", title_data, broadcast=True)
        # Peer_A, Peer_B, Peer_C are online and should have it in mempool, Peer_D is offline and should NOT
        status = manager.get_nodes_status()
        self.assertEqual(len(status["Peer_A"]["mempool"]), 1) # 0 initial + 1 new
        self.assertEqual(len(status["Peer_D"]["mempool"]), 0) # offline, didn't receive it
        
        # Connect Peer_D back and run consensus
        manager.toggle_node_connection("Peer_D")
        
        # If we mine a block on Peer_A
        manager.mine_block_on_node("Peer_A")
        # Propagate it to Peer_B to make it the majority chain (2 out of 4 online nodes, resolving tie by length)
        manager.nodes["Peer_B"].chain = copy.deepcopy(manager.nodes["Peer_A"].chain)
        
        # Consensus should sync Peer_C and Peer_D to the new chain
        success_consensus, synced = manager.resolve_consensus()
        self.assertTrue(success_consensus)
        self.assertIn("Peer_D", synced)
        self.assertIn("Peer_C", synced)
        
        # Remove dynamic node
        success_delete = manager.remove_node("Peer_D")
        self.assertTrue(success_delete)
        self.assertNotIn("Peer_D", manager.get_nodes_status())

if __name__ == '__main__':
    unittest.main()
