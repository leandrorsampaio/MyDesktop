# Episode 2: Your Server is Just a Waiter

**Duration:** ~10 minutes
**Topics:** Backend fundamentals, Node.js, Express, REST APIs, JSON persistence, server alternatives

---

Hey, welcome back. Last time we talked about how the web changed. Today we're going into territory that might feel unfamiliar — the backend. The server side. That mysterious place where things happen behind the curtain.

You told me you basically know nothing about the backend. Perfect. Let's fix that.

## What Even Is a Server?

OK, imagine a restaurant. You — the browser — are a customer sitting at a table. You want food. But you can't go into the kitchen yourself. You need a waiter.

That waiter is the server.

You tell the waiter what you want — "I'd like the pasta, please." The waiter walks to the kitchen, gets your pasta, brings it back to your table. That's it. That's a server. It **listens** for requests, **processes** them, and **sends back** a response.

In your project, `server.js` is that waiter. When your browser says "Hey, give me all the tasks," the server opens the `tasks.json` file, reads the data, and sends it back. When the browser says "Create a new task with this title," the server takes that information, adds it to the file, and confirms "Done."

Every interaction between your frontend and your backend follows this pattern: **request** and **response**. Always. The browser asks, the server answers. The server never calls the browser on its own and says "Hey, I've got something for you." It just sits there, waiting. Like a waiter standing by the kitchen door.

## Node.js: JavaScript on the Server

Here's something that would have been wild to hear in 2010: the server is running JavaScript.

Back then, servers ran PHP, Java, Ruby, Python. JavaScript was only for the browser. Then in 2009, a guy named Ryan Dahl created **Node.js**, which took the V8 JavaScript engine — the same one inside Google Chrome — and made it run outside the browser. Suddenly you could write server code in JavaScript.

Why does that matter? Because you only need to know one language. Your frontend code in `app.js`? JavaScript. Your backend code in `server.js`? Also JavaScript. Same syntax, same concepts, same language. Before Node.js, you had to learn PHP or Java just to build a backend. Now? JavaScript everywhere.

Your project uses Node.js to run the server. When you type `node server.js` in the terminal, Node starts up, loads your code, and begins listening for requests on port 3001.

## Express: The Framework for Your Waiter

Node.js by itself can handle requests, but it's pretty low-level. It's like telling your waiter "Here's a kitchen, here's a dining room, figure it out." Express is a small framework that gives the waiter a system: "When someone orders from this section of the menu, go to this station in the kitchen."

In code terms, Express lets you define **routes**. A route is a combination of an HTTP method and a URL path. Let me explain both.

**HTTP methods** are like types of requests. The main ones:

- **GET** — "Give me data." Like asking the waiter "What's on today's menu?" Nothing changes, you're just asking for information.
- **POST** — "Create something new." Like placing an order. "I'd like a new task, please."
- **PUT** — "Update something that exists." Like telling the waiter "Actually, change my pasta to the risotto."
- **DELETE** — "Remove something." Like canceling your order.

Your project uses all four. When the browser wants all tasks, it sends a `GET` to `/api/work/tasks`. When you create a task, it sends a `POST`. When you edit one, it sends a `PUT`. When you delete, well... `DELETE`.

The **URL path** is the address. In your project, you have paths like `/api/:profile/tasks`. That `:profile` part is a variable — it could be "work" or "personal" or whatever the user's profile alias is. Express extracts that automatically and gives it to you as `req.params.profile`. So `/api/work/tasks` and `/api/personal/tasks` both hit the same route, but the server knows which profile's data to use.

## The Request-Response Cycle

Let's walk through what happens when you drag a task from "To Do" to "In Progress" in your app:

1. Your browser JavaScript detects the drag and drop.
2. It immediately updates the screen — the card moves visually. This is optimistic UI, we'll talk more about that later.
3. In the background, the browser sends a `POST` request to `/api/work/tasks/abc123/move` with a body that says `{ "newStatus": "inprogress", "newPosition": 0 }`.
4. That request travels over HTTP to your Node.js server on port 3001.
5. Express matches it to the route `POST /api/:profile/tasks/:id/move`.
6. The server reads `tasks.json`, finds the task with id `abc123`, changes its status and position, recalculates positions for all tasks in both columns, and writes the file back.
7. The server sends back a response: the updated task object, with HTTP status 200, meaning "OK, all good."
8. Your browser receives the response. If something went wrong, it would roll back the visual change. But it worked, so nothing more to do.

That whole thing happens in maybe 50 milliseconds. The user saw the card move instantly because of the optimistic update in step 2.

## JSON Files: Your "Database"

Most real applications use a database — MySQL, PostgreSQL, MongoDB, something like that. A database is software specifically designed to store, organize, and retrieve data efficiently. It handles things like concurrent access, searching, relationships between data, and backing up.

Your project doesn't use a database. It uses JSON files. And honestly? For a single-user local app, that's fine. Your server has two helper functions — `readJsonFile` and `writeJsonFile` — that read from and write to these files. When you need all tasks, it reads `tasks.json`, parses it into a JavaScript array, and there you go.

The tradeoff? JSON files don't handle multiple users well. If two people wrote to the same file at the same time, you could lose data. There's no query language, so if you wanted "all tasks created last week with priority true," you'd have to load all tasks into memory and filter them in JavaScript. For your project, that's fine — it's one person, maybe a hundred tasks. For a company with millions of records? You need a real database.

## How Other Servers Work

Your setup is Node.js + Express. But there are many other options out there:

**Apache** — this is the old classic. Apache HTTP Server has been around since 1995. It's what most of the web ran on when you were working in the area. Apache is great at serving static files — HTML, CSS, images. It can also run PHP, which was the most popular server-side language for decades. WordPress, for example, runs on Apache + PHP. It's still widely used today, but for new projects, people usually pick something more modern.

**Nginx** — pronounced "engine-x." Similar to Apache but designed to handle many more simultaneous connections. A lot of big websites use Nginx as a "reverse proxy" — it sits in front of your actual application server, handles the incoming traffic, and distributes it. Think of it as a host at the restaurant entrance who directs people to different waiters.

**Next.js** — this is interesting. Next.js is a React framework that gives you a server built-in. You write React components, and Next.js can render them on the server before sending them to the browser. It also handles routing, API endpoints, and more. It's like React + Express merged together, with extra features on top. Very popular for modern web apps.

**Serverless** — this is a newer concept. Instead of having a server running all the time waiting for requests, you write individual functions that only run when someone calls them. Services like AWS Lambda or Vercel Functions handle this. You pay only for the time your code runs. No server to manage. The trade-off is you lose some control and there's a small delay — called a "cold start" — when a function hasn't been called recently.

**Salesforce/LWC context** — In Salesforce, the backend is completely different. Instead of Express routes, you write **Apex classes** — that's Salesforce's server-side language, similar to Java. Your LWC components call Apex methods using a special `@wire` decorator or `imperative` calls. The data comes from Salesforce's own database — they call it the "org." You don't manage files or servers. Salesforce handles all of that. It's a very different world, but the concept is the same: frontend asks, backend answers.

## Middleware: The Server's Assembly Line

One more concept. In your `server.js`, you'll see things like `express.json()` and `express.static()` and `resolveProfile`. These are called **middleware**.

Think of it like an assembly line. Every request that comes into your server passes through a series of stations before it reaches the route handler. Each station can do something to the request, or decide to reject it.

`express.json()` looks at the incoming request and, if it contains JSON data, parses it into a JavaScript object. Without it, you'd get raw text.

`express.static('public')` says "if someone asks for a file that exists in the `public` folder, just send it directly." That's how your browser gets `app.js`, `styles.css`, and all your component files.

Your `resolveProfile` middleware checks that the profile in the URL actually exists. If someone asks for `/api/nonexistent/tasks`, it catches that early and returns an error before the route handler even runs.

And there's `rateLimiter` — a middleware that tracks how many requests a user makes per minute. If they exceed the limit, it rejects the request with a "too many requests" error. Your AI chat endpoint has a stricter one — 10 requests per minute — to avoid burning through API credits.

## Wrapping Up

So, the backend. Not that scary, right? It's a program that listens for requests and sends responses. Your `server.js` uses Node.js and Express to define routes. Each route reads or writes JSON files. Middleware handles the common stuff like parsing data and serving files.

The key takeaway: in modern web development, the frontend and backend are separate programs that talk to each other through HTTP. Your browser app doesn't know or care that the server is Node.js. It could be Python, Java, PHP — doesn't matter. As long as it sends back the right JSON when asked.

Next time, we're going to talk about components — the building blocks of your UI. How your `<task-card>` and `<modal-dialog>` work, and how they compare to React components and LWC.

Catch you in the next one.

---

*Next episode: "Components: The LEGO Blocks" — Web Components, Shadow DOM, Custom Elements lifecycle, and framework comparisons.*
