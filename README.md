[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/cloudflare-workers-mcp-badge.png)](https://mseep.ai/app/cloudflare-workers-mcp)

# `workers-mcp`

> **Talk to a Cloudflare Worker from Claude Desktop!**

> [!WARNING]  
> You should start [here](https://developers.cloudflare.com/agents/guides/remote-mcp-server/) instead — and build a **remote** MCP server
>
> You can connect to remote MCP servers from Claude Desktop, Cursor, and other clients [using mcp-remote](https://developers.cloudflare.com/agents/guides/test-remote-mcp-server/).

### What is `workers-mcp`?

This package provides both the CLI tooling and the in-Worker logic to connect Claude Desktop (or any [MCP Client](https://modelcontextprotocol.io/)) to a Cloudflare Worker on your account, so you can customise it to suit your needs. It works via a build step that can translate TypeScript methods of your Worker like this:

```ts
export class ExampleWorkerMCP extends WorkerEntrypoint<Env> {
  /**
   * Generates a random number. This is extra random because it had to travel all the way to
   * your nearest Cloudflare PoP to be calculated which... something something lava lamps?
   *
   * @return {string} A message containing a super duper random number
   * */
  async getRandomNumber() {
    return `Your random number is ${Math.random()}`
  }
  
  // ...etc
}
```

...into MCP tools that a local Node.js server can expose to MCP clients. The Node.js server acts as a proxy, handling stdio transport locally, and calling the relevant method of your Worker running on Cloudflare. This allows you to expose any function or API in your app, or any service in [Cloudflare's developer platform](https://developers.cloudflare.com/products/), back to a LLM in your coding agent, Claude Desktop or other MCP client.

![image](https://github.com/user-attachments/assets/c16b2631-4eba-4914-8e26-d6ccea0fc578)

> <sub>Yes, I know that `Math.random()` works the same on a Worker as it does on your local machine, but don't tell Claude</sub> 🤫

## Usage

### Step 1: Generate a new Worker

Use `create-cloudflare` to generate a new Worker.

```shell
npx create-cloudflare@latest my-new-worker
```

I suggest choosing a `Hello World` worker.

### Step 2: Install `workers-mcp`

```shell
cd my-new-worker # I always forget this bit
npm install workers-mcp
```

### Step 3: Run the `setup` command

```shell
npx workers-mcp setup
```

Note: if something goes wrong, run `npx workers-mcp help`

### Step 4..♾️: Iterating

After changing your Worker code, you only need to run `npm run deploy` to update both Claude's metadata about your function and your live Worker instance.

However, if you change the names of your methods, or their parameters, or add or remove methods, Claude will not see the updates until you restart it.

You shouldn't ever need to rerun `npx workers-mcp install:claude`, but it's safe to do so if you want to rule out Claude config as a source of errors.

## Using with Other MCP Clients

### Cursor

To get your Cloudflare MCP server working in Cursor, you need to combine the 'command' and 'args' from your config file into a single string and use type 'command'.

For example, if your config file looks like:

```json
{
  "mcpServers": {
    "your-mcp-server-name": {
      "command": "/path/to/workers-mcp",
      "args": [
        "run",
        "your-mcp-server-name",
        "https://your-server-url.workers.dev",
        "/path/to/your/project"
      ],
      "env": {}
    }
  }
}
```

In Cursor, create an MCP server entry with:
* type: `command`
* command: `/path/to/workers-mcp run your-mcp-server-name https://your-server-url.workers.dev /path/to/your/project`

### Other MCP Clients

For Windsurf and other MCP clients, update your configuration file to include your worker so you could use the tools directly from the client:

```json
{
  "mcpServers": {
    "your-mcp-server-name": {
      "command": "/path/to/workers-mcp",
      "args": [
        "run",
        "your-mcp-server-name",
        "https://your-server-url.workers.dev",
        "/path/to/your/project"
      ],
      "env": {}
    }
  }
}
```

Make sure to replace the placeholders with your actual server name, URL, and project path.

## Examples

See the `examples` directory for a few ideas of what to use this for:

* `examples/01-hello-world` is a snapshot taken after the installation instructions above
* `examples/02-image-generation` uses Workers AI to run the Flux image generation model. Claude is really good at suggesting prompts and can actually interpret the outcome and decide what new prompts to try to achieve the outcome you want.
* TODO Browser Rendering
* TODO Durable Objects
