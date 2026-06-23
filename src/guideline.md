# Overall Guideline


## Purpose
This file is overall (this project repository) level guideline. The rules and principles and style apply to all code files in this codebase.
In each directory, there is a "guideline.md" file, please read the file and understand the content and strictly follow the conventions and rules in these guidelines.
The code in this repository is a backend service that base on bunjs, when writing new codes, please use bunjs apis and conventions and styles priorer than nodejs but lower prior than conventions and styles mentioning in "guideline.md" files in any directory.


## Concepts
This codebase forms a microservice which is a Application of company's business logic system. There are 3 concepts which are representing 3 levels of logic:
- Application: the top level logic, only in charge of process (nodejs concept) and initialization related jobs.
- Business Logic: the middle level, primarily starting in appinterfaces by calling different handlers and business logic related codes.
- Modules: the bottom level, only wrapping installed modules or basic modules into more abstracted level of functions for being called by other functions in this codebase.





## Directory Structure and File Explaination
| Directory(File)|	Explaination																					|
| ------------- | ------------------------------------------------------------------------------------------------- |
| ./apphandlers	|	Has files that with all application level event handler functions     								|
| ./appinterfaces		|	This is the application level interface source codes directory    |
| ./commontypes		|	The type definitions that can be used all over the project scope    |
| ./modules		|	Has files that wrapping all basic libraries' functions into one level higher abstracted functions     |
| ./services	|	Has files with multiple functions included that can call 3rd party APIs or pushing message to message queues    |
| ./app.ts		|	This is the top level (application level) entry file, including starting server, preparing necessary libraries initialization    |

The app.ts only register process level event handlers and emit 'APPSTART' event. All application level initialzations should be done in 'APPSTART' event handler.


## Conventions
- Using 4 spaces equivalent TAB indentation. Do NOT use 2 spaces as indentation format.
- Write code as simple as possible. Avoid unnecessary clousures or Immediate Invoke Functions. Avoid function nesting functions.
	This is BAD:
	```javascript
	function(req, res) {
		let data
		if (typeof req === 'string') {
			data = function(){
				return JSON.parse(req)
			}()
		}
		return function(){
			return Object.keys(data).length
		}()

	}
	```
- Avoid if else nesting, put all possible error check first , then write the main logic after all these error checks. for example:
    This is BAD:
	```javascript
	const user = JSON.parse(req.data)
	if (user) {
		if (user.id){
			if (typeof user.id === 'string') {
				console.log('user id: ', user.id)
				let newUser = {id: user.id}
			}
		}
	}
	```
	This is GOOD:
	```javascript
	const user = JSON.parse(req.data)
	if (!user) throw 'INVALID_USER'
	if (!user.id) throw 'USER_ID_MISSING'
	if (typeof user.id !== 'string') throw 'USER_ID_TYPE_ERROR'
	console.log('user id: ', user.id)
	let newUser = { id: user.id }
	```
- Absolutely forbid a function calling another function within the same file. Always calling functions that imported from lower logic level directory.
	This is BAD:
	```javascript
	// src/services/badexample.ts
	function subFunc(p: string) {
		// something
	}

	export const primaryLogic() {
		const r = subFunc()
		return r
	}
	```
- All functions should be exported and called by higher logic level scripts, except app.ts.
- Between each exported functions, there should be at a 4 lines of blanks to visually seperate functions.
- Error convention: throw error message in a string. The string should be in capital letter with a lower dash connecting words. Example:
	```javascript
	throw 'MISSING_PARAMETER'
	```
- Function structure should like this:
  - 1.always do parameter check or neccesary error check first;
  - 2.declare a variable with type annotion for result, then call await functions with try...catch block enclosing it;
  - 3.check result variable if it is as expected after the try...catch block, if the result is not as expected, throw error following error convention;
  - 4.return result at the bottom of the function code block.
	This is GOOD:
	```javascript
	import { connectServer } from 'somelibrary'

	export const funcName = async (config: {host: string, port: number}) => Promise<string> {

		if (!config) throw 'MISSING_PARAMETER'
		if (!config.host || typeof config.host !== 'string') throw 'INVALID_PARAMETER_HOST'
		if (!config.port || typeof config.port !== 'number') throw 'INVALID_PARAMETER_PORT'

		let res: string
		try {
			res = await connectServer(config)
		} catch(e){
			throw 'FAILED_WHEN_CONNECT_SERVER'
		}
		if (!res) throw 'ERROR_WHEN_CONNECT_SERVER'

		return res

	}
	```
