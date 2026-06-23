# appinterfaces
This guideline is adding more specific requirements base on src/guideline.md, all rules and conventions and styles apply to every file in current directory (src/appinterfaces/*.ts).

This directory contains primary entrance points for the application interfaces:
- ./messenger, has the code that subscribes to the some redis pub/sub channels and listens for incoming messages. The handler functions for incoming messages are defined here. Actual Handler functions are defined in ./messenger/handlers/*.ts, each handler function is responsible for handling a specific message type. These handler functions are exported to index.ts, and exported by index.ts for higher level scripts calling.
- ./mq, has the code that initializes the message queue and listens for incoming messages. The handler functions for incoming messages are defined in ./mq/handlers/*.ts. Each handler function is responsible for handling a specific message type. These handler functions are exported to index.ts, and exported by index.ts for higher level scripts calling.
