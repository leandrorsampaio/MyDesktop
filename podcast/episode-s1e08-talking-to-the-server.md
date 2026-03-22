# Episode 8: Talking to the Server: APIs and Fetch

**Duration:** ~9 minutes
**Topics:** HTTP, REST APIs, fetch, async/await, Promises, rate limiting, framework data fetching

---

Hey, welcome back. We've covered how your components work, how they communicate, and how routing works. Today we're going to bridge the gap between frontend and backend — the actual conversation between your browser app and your server.

This is where async/await lives, where Promises happen, and where a lot of developers — even experienced ones — get confused. Let's make it clear.

## The Old Days vs Now

Back in your time, if you wanted to get data from a server without reloading the page, you used something called XMLHttpRequest. Or if you were using jQuery, you called `$.ajax()`. It worked, but the code was ugly — nested callbacks, hard to read, hard to debug.

Modern JavaScript has much better tools. Two key innovations: **Promises** and **async/await**.

## Promises: An IOU for Data

A Promise is exactly what it sounds like: a promise that you'll get a value... eventually. When you ask the server for data, you don't get the data back immediately. The server needs time to process. A Promise is the placeholder that says "I don't have the answer yet, but I will."

A Promise can be in three states:

- **Pending** — still waiting for the answer
- **Fulfilled** — got the answer, here it is
- **Rejected** — something went wrong, here's the error

Before async/await, you'd chain Promises with `.then()`:

"Fetch the tasks, THEN parse the JSON, THEN do something with the data, and if anything goes wrong, CATCH the error."

This was better than callbacks, but complex chains could still get messy. Enter async/await.

## Async/Await: Making Async Code Look Simple

`async/await` is syntactic sugar on top of Promises. It makes asynchronous code look and behave like synchronous code.

You mark a function with `async`, and inside it, you can use `await` before any Promise. The `await` pauses that function until the Promise resolves. The rest of your app keeps running — JavaScript doesn't actually freeze. It's just that specific function that waits.

Your `api.js` uses this everywhere. When it fetches tasks, it says "await the fetch call, then await parsing the JSON." The code reads like a recipe: step 1, step 2, step 3. Easy to follow.

Error handling uses `try/catch`, just like synchronous code. Wrap your awaits in a try block, and if any of them fail, the catch block handles it.

## Your api.js: A Clean API Layer

Your project has a dedicated `api.js` file that's worth talking about. It contains pure HTTP functions — functions that ONLY handle the server communication and nothing else. No UI updates, no state changes, no toast notifications. Just: send request, return response.

This separation is important. When `moveTaskApi(id, newStatus, newPosition)` is called, it sends the POST request and returns the result. The calling code — in `app.js` or a page module — is responsible for updating the state and UI.

Why separate them? Because it keeps each layer focused. If you later change your server URL, or switch to a different API format, you only change `api.js`. If you change how the UI renders, you don't touch the API functions. This is called **separation of concerns**, and it's a fundamental architecture principle.

## REST: The Language of Web APIs

Your server follows a pattern called **REST** — Representational State Transfer. Don't let the name intimidate you. It's just a set of conventions for organizing API endpoints.

The main ideas:

**Resources** — everything is a resource with a URL. Tasks live at `/api/:profile/tasks`. A specific task lives at `/api/:profile/tasks/:id`. Epics at `/api/:profile/epics`. Each URL represents a "thing."

**HTTP methods define the action** — GET retrieves, POST creates, PUT updates, DELETE removes. The URL says WHAT you're working with. The method says WHAT you're doing to it.

**Stateless** — each request is independent. The server doesn't remember your previous requests. Every request contains all the information needed to process it. That's why your AI chat page sends the entire conversation history with every request — the server has no memory between calls.

REST isn't the only pattern. **GraphQL** is an alternative where the client specifies exactly which fields it wants. Instead of getting a full task object every time, you could say "just give me the title and priority." It's popular for complex apps with lots of related data. Facebook created it, and it's used by GitHub, Shopify, and many others.

There's also **gRPC** — a protocol used mainly for server-to-server communication. It's faster than REST but more complex to set up. You probably won't encounter it in frontend work.

## Rate Limiting: Protecting the Server

Your project has an interesting backend concept: **rate limiting**. This is a middleware that counts how many requests come in per minute and rejects requests that exceed the limit.

You have two rate limiters:
- A general write limiter for task operations
- A stricter one for AI chat — 10 requests per minute — because each AI request costs money (API credits)

Why rate limit? Two reasons. First, protection — if something goes wrong and your frontend starts sending thousands of requests per second, the rate limiter prevents the server from being overwhelmed. Second, cost — for external APIs like the AI providers, every request has a price.

In production applications, rate limiting is essential. Services like Cloudflare, AWS API Gateway, and Nginx provide rate limiting at the infrastructure level. Your Express middleware is the simplest version of the same concept.

## Parallel Requests: Performance Trick

Here's a pattern your project uses that's worth highlighting. When the archive page loads, it needs three things: tasks, epics, and categories. It could fetch them one by one — get tasks, wait, get epics, wait, get categories, wait. That would take three round trips in sequence.

Instead, your `initArchivePage` fires all three requests at once using `Promise.all()`. All three go out simultaneously, and `Promise.all()` waits until ALL of them complete. If each request takes 100 milliseconds, the sequential approach takes 300ms. The parallel approach? Just 100ms — the time of the slowest one.

This is a simple but powerful optimization. Whenever you need multiple independent pieces of data, fetch them in parallel.

## How Frameworks Handle Data Fetching

Each framework has its own approach to talking to the server.

**React** — by default, React doesn't have a built-in data fetching solution. You use `fetch` or `axios` (a popular library) inside `useEffect`. But this gets repetitive — you need loading states, error states, caching, refetching... So most React apps use a library:

- **TanStack Query** (formerly React Query) — handles caching, refetching, optimistic updates, pagination, and more. It's almost standard now for React apps.
- **SWR** (from Vercel) — similar to TanStack Query, focuses on the "stale while revalidate" pattern: show cached data immediately, then refresh in the background.
- **Next.js Server Components** — the newest approach. Data fetching happens on the server, not in the browser. The component runs on the server, fetches data, renders HTML, and sends the result. The browser never makes the API call at all.

**Angular** has `HttpClient` built in. It uses Observables (from a library called RxJS), which are like Promises but can emit multiple values over time. Think of a Promise as "here's one value eventually" and an Observable as "here's a stream of values over time." It's powerful but has a steep learning curve.

**Svelte** uses regular `fetch` in `onMount`, or in SvelteKit you can use `load` functions that run on the server. Simple and straightforward.

**LWC** has two main approaches:

1. **Wire adapters** — the `@wire` decorator connects a component to Salesforce data. You declare "I want records from this object where these conditions are met," and Salesforce handles fetching, caching, and refreshing automatically. It's declarative — you describe WHAT you want, not HOW to get it. This is the recommended approach and it's very powerful within Salesforce.

2. **Imperative Apex calls** — when you need more control, you call an Apex method directly from JavaScript. This is similar to your `api.js` approach — you explicitly call a function and handle the result. The syntax is: `import myMethod from '@salesforce/apex/MyController.myMethod'` and then `const result = await myMethod({ param1: value })`.

The wire adapter is unique to LWC/Salesforce and has no direct equivalent in other frameworks. It's like having TanStack Query built into the platform, deeply integrated with the database.

## Error Handling Across the Stack

In your project, error handling follows a clean pattern:

1. **api.js** — checks the response status. If the server returned an error, it throws.
2. **Calling code** — catches the error, rolls back optimistic UI changes, shows a toast notification.
3. **Server** — validates input, returns `{ error: "message" }` with HTTP 400 for bad requests.

This three-layer approach is standard across all frameworks. The names and syntax change, but the pattern is: validate on the server, propagate errors to the client, handle gracefully in the UI.

## The Takeaway

The conversation between frontend and backend is just HTTP requests carrying JSON data back and forth. Your `api.js` keeps this clean and separated. Promises and async/await make the asynchronous nature manageable. REST gives you a consistent URL and method structure.

Frameworks add convenience layers on top — caching, automatic refetching, declarative data connections — but underneath, it's all the same: ask the server, get JSON, update the UI.

Next episode, we're talking about templates — how your components define their visual structure, and how that compares to JSX, Svelte templates, and LWC HTML files.

Catch you in the next one.

---

*Next episode: "The Template Game" — Runtime template loading, template caching, JSX, Svelte templates, LWC templates.*
