# services directory

All internal services or 3rd party APIs are considered as "services". All files with functions that calling the "services" should put in this directory. All functions should be exported and called by other handler functions.

Example of exporting functions like such:
```javascript
export const funcName = async (param: any) => {
	// your logic
	// calling other APIs or push message to message queue
}
```
