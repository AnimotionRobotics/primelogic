# modules

This guideline is adding more specific requirements base on src/guideline.md, all mmentioning rules and conventions and styles in this file apply to every file in current directory (src/modules/*.ts).

This directory only allows files that wrapping installed dependencies' functions as foundaton modules for this repository.
A module is a file in this directory. A module includes functions that exported and letting upper logic level scripts call to fulfill their level purpose with their logic codes.

A module usually has initialise functions and finishing or ending functions to get related connection or data ready. Take cache.ts for example, it is a cache module that connecting to redis. So it has connectCache(connString) for connecting to redis with connecting string (the connString parameter), and a disconnectCache() for disconnecting from redis. Other functions like setString() is a wrapper function that wrapping lower level redis features to a abstracted layer of function and exported it to caller for easy use.
