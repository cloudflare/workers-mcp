import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import fs from 'node:fs'
import path from 'node:path'
import { EntrypointDoc } from './types'
import photon from '@silvia-odwyer/photon-node'
import { dir } from 'tmp-promise'

export function log(...args: any[]) {
  const msg = `[DEBUG ${new Date().toISOString()}] ${args.join(' ')}\n`
  process.stderr.write(msg)
}

function reencodeImage(original: string) {
  const image = photon.PhotonImage.new_from_base64(original)
  return image.get_bytes_jpeg(80)
}

export async function localProxy(claude_name: string, workers_url: string, workers_dir: string = process.cwd(), connect_sid: string = '') {
  if (!claude_name || !workers_url) {
    console.error('usage: npx workers-mcp run <claude_name> <workers_url> [workers_dir] [connect_sid]')
    process.exit(1)
  }

  const tools_path = path.resolve(workers_dir, 'dist/docs.json')
  if (!fs.existsSync(tools_path)) {
    console.error(`Could not find ${tools_path}`)
    process.exit(1)
  }
  const TOOLS = JSON.parse(fs.readFileSync(tools_path, 'utf-8'))
  log(JSON.stringify(TOOLS, null, 2))

  const secret_path = path.join(workers_dir, '.dev.vars')
  if (!fs.existsSync(secret_path)) {
    console.error(`Could not find ${secret_path}`)
    process.exit(1)
  }
  const SHARED_SECRET = fs
    .readFileSync(secret_path, 'utf8')
    .split('\n')
    .map((line) => {
      const match = line.match(/SHARED_SECRET=(.*)/)
      return match?.[1]
    })
    .find(Boolean)
  if (!SHARED_SECRET) {
    console.error(`Could not find SHARED_SECRET in ${secret_path}`)
    process.exit(1)
  }
  const { path: tmpdir } = await dir()
  log(`Using tmpdir: ${tmpdir}`)

  const server = new Server(
    { name: claude_name, version: '1.0.0' },
    { capabilities: { /*resources: {}, */ tools: {} } },
  )

  const WORKER_SCHEMA = Object.values(TOOLS as Record<string, EntrypointDoc>).find(
    (tool) => tool.exported_as === 'default',
  )
  if (!WORKER_SCHEMA) {
    console.log(`No default exported WorkerEntrypoint found! Check dist/docs.json`)
    process.exit(1)
  }

  // print out env in a nice format
  //
  // server.setRequestHandler(ListResourcesRequestSchema, async () => {
  //   log('Received list resources request')
  //
  //   return {
  //     resources: (WORKER_SCHEMA.statics.Resources || []).map(({ name, type, description }) => ({
  //       uri: `resource://${name}`,
  //       name,
  //       description,
  //       mimeType: type === 'string' ? 'text/plain' : undefined,
  //     })),
  //   }
  // })
  //
  // server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  //   log(JSON.stringify(request, null, 2))
  //   const { uri } = request.params
  //   log('Received read resource request: ', uri)
  //
  //   const resource = (WORKER_SCHEMA.statics.Resources || []).find(({ name }) => `resource://${name}` === uri)
  //   log(JSON.stringify(resource, null, 2))
  //   if (!resource) {
  //     throw new Error(`Couldn't find resource at uri ${uri}`)
  //   }
  //
  //   const fetchUrl = `${workers_url}/resources/${resource.name}`
  //   log(fetchUrl)
  //   const response = await fetch(fetchUrl, {
  //     headers: {
  //       'Content-Type': 'application/json',
  //       Authorization: 'Bearer ' + SHARED_SECRET,
  //     },
  //   })
  //
  //   if (!response.ok) {
  //     throw new Error(`Failed to fetch resource: ${response.status} ${await response.text()}`)
  //   }
  //
  //   return {
  //     contents: [
  //       {
  //         uri,
  //         name: resource.name,
  //         // TODO: do other types
  //         mimeType: 'text/plain',
  //         text: await response.text(),
  //       },
  //     ],
  //   }
  // })

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log('Received list tools request')
    return {
      tools: WORKER_SCHEMA.methods.map((doc) => {
        return {
          name: doc.name,
          description: doc.description,
          inputSchema: {
            type: 'object',
            properties: Object.fromEntries(
              doc.params.map(({ name, description, type }) => [name, { description, type }]),
            ),
            required: doc.params.map(({ name, optional }) => (optional ? undefined : name)).filter(Boolean),
          },
        }
      }),
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name
    log('Received tool call:', toolName)

    const method = WORKER_SCHEMA.methods.find((doc) => doc.name === toolName)

    if (!method) {
      return {
        content: [{ type: 'text', text: `Couldn't find method '${toolName}' in entrypoint` }],
        isError: true,
      }
    }
    log(JSON.stringify(request.params))
    log(JSON.stringify(method.params))
    const args = method.params.map((param) => request.params.arguments?.[param.name])

    const init = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + SHARED_SECRET,
        'X-CONNECT-SID': connect_sid
      },
      body: JSON.stringify({ method: toolName, args }),
    }
    log(JSON.stringify(init))
    const response = await fetch(workers_url + '/rpc', init)

    const bytes = await response.arrayBuffer()
    if (bytes.byteLength === 0) {
      return {
        content: [{ type: 'text', text: `Fetch failed. Got (${response.status}) Empty response` }],
        isError: true,
      }
    }
    log(`Got ${bytes.byteLength} bytes`)

    const text = new TextDecoder().decode(bytes)
    if (!response.ok) {
      return {
        content: [{ type: 'text', text: `Fetch failed. Got (${response.status}) ${text}` }],
        isError: true,
      }
    }

    const contentType = response.headers.get('content-type')

    const imageType = contentType?.match(/image\/(\w+)/)
    if (contentType?.match(/text\/plain/)) {
      return {
        content: [{ type: 'text', text }],
      }
    } else if (imageType) {
      const buffer = Buffer.from(bytes)
      const type = imageType[1]
      const filename = path.join(tmpdir, `${+new Date()}.${type}`)
      fs.writeFileSync(filename, buffer)
      let base64 = buffer.toString('base64')
      fs.writeFileSync(filename + '.base64', base64)
      // Workers AI sends down pretty huge JPEGS, so reencode them so Claude can handle them
      if (type === 'jpeg') {
        const smallerImage = reencodeImage(base64)
        const smallerFile = `${filename}.reencode.${type}`
        fs.writeFileSync(smallerFile, smallerImage)
        base64 = Buffer.from(smallerImage).toString('base64')
        fs.writeFileSync(smallerFile + '.base64', base64)
      }
      log(filename, contentType)
      return {
        content: [{ type: 'image', data: base64, mimeType: contentType }],
      }
    } else if (contentType?.match(/application\/json/)) {
      const content = JSON.parse(text)
      log(`Got response: ${text.slice(0, 1000)}`)
      return 'content' in content
        ? content
        : {
            content: Array.isArray(content) ? content : [content],
          }
    } else {
      return {
        content: [{ type: 'text', text: `Unknown contentType ${contentType} ${text.slice(0, 1000)}` }],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
