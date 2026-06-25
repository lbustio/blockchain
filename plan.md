# Plan de Implementación: Demo Interactiva de Blockchain para Estudiantes

Este plan detalla el desarrollo de una aplicación web interactiva y altamente visual diseñada como herramienta educativa para enseñar los conceptos fundamentales de Blockchain: Hashing, Bloques, Cadenas de Bloques, Redes Distribuidas (P2P), Consenso y Transacciones/Mempool.

El backend se desarrollará en **Python** (utilizando **FastAPI**) y el frontend será una **interfaz web enriquecida y moderna** con HTML, CSS vainilla y JavaScript, servida directamente por el servidor Python para facilitar su ejecución con un solo comando.

---

## Estructura Propuesta

```text
blockchain-demo/
│
├── main.py                 # Punto de entrada de la aplicación FastAPI
├── requirements.txt        # Dependencias de Python (fastapi, uvicorn)
│
├── backend/
│   ├── __init__.py
│   ├── blockchain.py       # Lógica del Core de Blockchain (Block, Blockchain, Transaction)
│   └── node_manager.py     # Simulación de múltiples nodos y consenso
│
└── frontend/
    ├── index.html          # Estructura principal y explicaciones
    ├── style.css           # Estilos premium, animaciones y visualización interactiva
    └── app.js              # Lógica del frontend (reactividad, llamadas a la API, animaciones)
```

---

### Backend (Python Core)

#### [blockchain.py](backend/blockchain.py)
Contendrá las clases principales:
*   `Transaction`: Representa una transferencia de tokens (remitente, destinatario, cantidad).
*   `Block`: Representa un bloque de la cadena con:
    *   `index`: Posición del bloque.
    *   `timestamp`: Fecha/hora de creación.
    *   `transactions` / `data`: Información contenida (soporta texto simple o transacciones estructuradas).
    *   `previous_hash`: Hash del bloque anterior.
    *   `nonce`: Número de un solo uso para la minería.
    *   `hash`: SHA-256 del bloque.
*   `Blockchain`: Clase que gestiona la cadena, dificultad de minado, validación de hashes, minado de bloques y mempool de transacciones pendientes.

#### [node_manager.py](backend/node_manager.py)
Gestionará múltiples instancias de `Blockchain` (Peer A, Peer B, Peer C) para simular la red distribuida. Implementará:
*   Inicialización de 3 peers con cadenas idénticas.
*   Método para alterar datos en un bloque de un peer específico.
*   Método de resolución de consenso (regla de la cadena más larga y válida, apoyada por la mayoría).

#### [main.py](main.py)
Configura FastAPI para:
*   Servir la API REST para interactuar con la simulación.
*   Servir el directorio `frontend/` de forma estática.
*   Definir endpoints:
    *   `GET /api/nodes`: Obtener el estado actual de todos los nodos.
    *   `POST /api/nodes/{node_id}/mine`: Minar un bloque en un nodo.
    *   `POST /api/nodes/{node_id}/tamper`: Alterar el contenido de un bloque para demostrar cómo se rompe la cadena.
    *   `POST /api/nodes/{node_id}/transactions`: Añadir una transacción al mempool.
    *   `POST /api/consensus`: Ejecutar el algoritmo de consenso para sincronizar la red.
    *   `POST /api/reset`: Reiniciar la simulación a su estado inicial.

---

### Frontend (Visual & Explicativo)

El frontend constará de una aplicación web de una sola página (SPA) con pestañas interactivas diseñadas para enseñar paso a paso:

1.  **Pestaña 1: Hash Sandbox**
    *   Un input de texto libre y el hash SHA-256 resultante actualizándose instantáneamente al escribir.
    *   Demuestra el efecto avalancha: un cambio minúsculo cambia el hash por completo.
2.  **Pestaña 2: Bloque Individual (Block)**
    *   Un bloque interactivo (Índice, Datos, Nonce, Hash).
    *   Un botón de **Minar** que muestra una animación del Nonce incrementando hasta que el Hash comience con los ceros requeridos.
    *   Si los datos cambian, el fondo del bloque se vuelve **rojo** (inválido). Al minar con éxito, se vuelve **verde** (válido).
3.  **Pestaña 3: Cadena de Bloques (Blockchain)**
    *   Una secuencia de bloques conectados visualmente con flechas.
    *   Cada bloque muestra su `Previous Hash` apuntando al bloque anterior.
    *   Alterar los datos de cualquier bloque rompe ese bloque y todos los siguientes (se vuelven **rojos** debido a la propagación del cambio de hash).
    *   Cada bloque tiene su botón "Minar" para reparar la cadena secuencialmente.
4.  **Pestaña 4: Red Distribuida (Consensus)**
    *   Visualización lado a lado de 3 nodos (Peer A, Peer B, Peer C).
    *   Permite alterar un bloque en Peer B y ver cómo su cadena se vuelve inválida localmente, mientras los otros peers se mantienen verdes.
    *   Un botón de **Consenso de Red** ejecutará el algoritmo, mostrando visualmente cómo Peer B es corregido al copiar la cadena válida de la mayoría.
5.  **Pestaña 5: Mempool & Transacciones (Ledger)**
    *   Creación de transacciones estructuradas (ej. `De: Alice, Para: Bob, Cantidad: 10`).
    *   Visualización del **Mempool** (transacciones pendientes en espera).
    *   Minado del bloque que toma las transacciones y las introduce en la cadena.
    *   Visualización de los balances de cada usuario actualizándose dinámicamente.

#### [index.html](frontend/index.html)
Definirá la estructura semántica de la página, los contenedores interactivos y las secciones explicativas laterales. Incorporará una tipografía moderna (Inter y Fira Code para hashes) y iconos limpios.

#### [style.css](frontend/style.css)
CSS de alta calidad con:
*   Diseño Responsivo con tema oscuro premium (Glassmorphism, sombras profundas, bordes brillantes).
*   Estados de color claros: Verde Neón (`#10b981`) para elementos válidos, Rojo/Rosa Neón (`#ef4444`) para inválidos y Ámbar/Oro (`#f59e0b`) para estados de minado o advertencias.
*   Animación para el minado (engranajes giratorios, brillos pulsantes del hash).
*   Transiciones suaves para los cambios de estado.

#### [app.js](frontend/app.js)
Controlará la interacción con la API de FastAPI, la actualización en tiempo real de los hashes, la animación del proceso de minado local (para dar respuesta instantánea al usuario) y la sincronización con el backend.

---

## Plan de Verificación

### Pruebas Automatizadas
Crearemos un script de prueba `test_blockchain.py` para verificar programáticamente la lógica del core en Python:
*   Prueba de hashing correcto.
*   Prueba de minado con dificultad variable.
*   Prueba de verificación de validez de la cadena.
*   Prueba de alteración de bloques y detección de invalidez.
*   Prueba de resolución de consenso en red.

Ejecutaremos las pruebas con:
```bash
.venv/Scripts/python -m unittest backend/test_blockchain.py
```

### Verificación Manual
1.  Iniciar el servidor: `.venv/Scripts/python main.py`
2.  Abrir `http://localhost:8000` en el navegador.
3.  Probar cada pestaña del tutorial secuencialmente.
