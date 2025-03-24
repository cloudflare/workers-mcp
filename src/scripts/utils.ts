import { spawn } from 'child_process'

export async function runCommand(command: string, args: string[]): Promise<string> {
  // Use shell option on Windows to ensure commands like npx are found
  const child = spawn(command, args, {
    stdio: ['inherit', 'pipe', 'inherit'], // Pipe stdout but keep stdin and stderr as inherit
    shell: process.platform === 'win32'
  })

  let output = ''

  // Capture stdout data
  child.stdout.on('data', (data) => {
    output += data.toString()
    process.stdout.write(data) // This pipes to terminal
  })

  // Wait for process to complete
  await new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(code)
      } else {
        reject(new Error(`Process exited with code ${code}`))
      }
    })
    child.on('error', reject)
  })

  return output
}

export async function runWithStdin(command: string, args: string[], stdin: string) {
  // Use shell option on Windows to ensure commands like npx are found
  const child = spawn(command, args, {
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32'
  })
  child.stdin.write(stdin + '\n')
  child.stdin.end()

  // Wait for process to complete
  await new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(code)
      } else {
        reject(new Error(`Process exited with code ${code}`))
      }
    })
    child.on('error', reject)
  })
}

export const EXAMPLE_TS = `
import { WorkerEntrypoint } from 'cloudflare:workers'
import { ProxyToSelf } from 'workers-mcp'

export default class MyWorker extends WorkerEntrypoint<Env> {
  /**
   * A warm, friendly greeting from your new Workers MCP server.
   * @param name {string} the name of the person we are greeting.
   * @return {string} the contents of our greeting.
   */
  sayHello(name: string) {
    return \`Hello from an MCP Worker, $\{name}!\`
  }

  /**
   * @ignore
   **/
  async fetch(request: Request): Promise<Response> {
    return new ProxyToSelf(this).fetch(request)
  }
}
`

export const EXAMPLE_JS = `
import { WorkerEntrypoint } from 'cloudflare:workers'
import { ProxyToSelf } from 'workers-mcp'

export default class MyWorker extends WorkerEntrypoint {
  /**
   * A warm, friendly greeting from your new Workers MCP server.
   * @param name {string} the name of the person we are greeting.
   * @return {string} the contents of our greeting.
   */
  sayHello(name) {
    return \`Hello from an MCP Worker, $\{name}!\`
  }

  /**
   * @ignore
   **/
  async fetch(request) {
    return new ProxyToSelf(this).fetch(request)
  }
}
`
