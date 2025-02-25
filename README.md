# `workers-mcp`

> **Talk to a Cloudflare Worker from Claude Desktop!**

This package provides both the CLI tooling and the in-Worker logic to connect Claude Desktop (or any [MCP Client](https://modelcontextprotocol.io/)) to a Cloudflare Worker on your account, so you can customise it to suit your needs.

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

For Windows users: If you encounter an `ERROR spawn npx ENOENT` error when running `npx workers-mcp setup`, you can manually execute the following commands to complete the deployment:

```shell
npx workers-mcp docgen src/index.ts
npx wrangler deploy
```

Note: if something goes wrong, run `npx workers-mcp help`

### Step 4..♾️: Iterating

After changing your Worker code, you only need to run `npm run deploy` to update both Claude's metadata about your function and your live Worker instance.

However, if you change the names of your methods, or their parameters, or add or remove methods, Claude will not see the updates until you restart it.

You shouldn't ever need to rerun `npx workers-mcp install:claude`, but it's safe to do so if you want to rule out Claude config as a source of errors.

## Examples

See the `examples` directory for a few ideas of what to use this for:

* `examples/01-hello-world` is a snapshot taken after the installation instructions above
* `examples/02-image-generation` uses Workers AI to run the Flux image generation model. Claude is really good at suggesting prompts and can actually interpret the outcome and decide what new prompts to try to achieve the outcome you want.
* TODO Browser Rendering
* TODO Durable Objects
