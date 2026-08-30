# Troubleshooting & Known Issues

This document lists common errors encountered during the development of Memorang and their corresponding solutions.

## 1. Client Hook in Server Component
**Error**: `Error: You're importing a component that needs useState. This React hook only works in a client component.`
**Cause**: Using `useState`, `useEffect`, or other React hooks in a file that Next.js treats as a Server Component by default.
**Solution**: Add the `"use client";` directive at the very top of the file (e.g., in `src/app/page.tsx` or `src/app/interactive/[sessionId]/page.tsx`).

## 2. Database Value Too Long (VARCHAR)
**Error**: `Interactive Upload Error: error: value too long for type character varying(20)`
**Cause**: Attempting to insert a string into a `VARCHAR(20)` column that exceeds the limit (e.g., `interactive_generation` is 22 characters).
**Solution**: Increase the column length in the database.
```sql
ALTER TABLE sessions ALTER COLUMN status TYPE VARCHAR(50);
```
Updated in `item-setup-db.js`.

## 3. PostgreSQL `rowCount` Nullability
**Error**: `TypeError: Cannot read property 'rowCount' of null` or strict null check failures in TypeScript.
**Cause**: The `pg` library's `query` result can sometimes return a null or undefined `rowCount` depending on the query type or environment.
**Solution**: Always check for both nullity and zero.
```typescript
if (!sessionRes.rowCount || sessionRes.rowCount === 0) {
    // handle not found
}
```

## 4. LangGraph Chunk Indexing
**Error**: `Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'NodeInterrupt' | 'BaseState'`.
**Cause**: TypeScript strict indexing on union types returned by LangGraph's streaming chunks.
**Solution**: Use an explicit cast to `any` when accessing properties of the chunk by a dynamic key (like `nodeName`).
```typescript
const nodeName = Object.keys(chunk)[0];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stateUpdate = (chunk as any)[nodeName];
```

## 5. Hydration Mismatches
**Error**: Hydration warnings in the console due to browser extensions.
**Cause**: Extensions like Dashlane or Grammarly modifying the DOM before React finishes hydration.
**Solution**: Used `suppressHydrationWarning` on the `<body>` tag in `layout.tsx` to ignore these non-fatal inconsistencies.

## 6. Blank Simulation / Unmount Errors
**Error**: `Attempted to synchronously unmount a root while React was already rendering` or `You are calling ReactDOMClient.createRoot() on a container that has already been passed to createRoot() before`.
**Cause**: In React 18 Strict Mode, components mount/unmount rapidly. Asynchronous cleanup (using `setTimeout`) created race conditions where a second root was created before the first was destroyed.
**Solution**: Implemented **Synchronous Unmount Pattern** in `live-preview.tsx`. We perform a clean `root.unmount()` immediately during the `useEffect` cleanup and set the reference to null. Re-mounting uses the stable `createRoot` once per mount cycle.

## 7. `capturedComponent` Narrowing error
**Error**: `Property 'displayName' / 'name' does not exist on type 'never'`.
**Cause**: TypeScript losing type info for `capturedComponent` after a successful execution inside a closure.
**Solution**: Explicitly cast the component to an object with optional properties during the logging phase.

## 8. Missing `framer-motion` or `React` in Simulation
**Error**: `Variable 'React' not found` or similar scope errors inside the simulation.
**Cause**: The execution scope for `new Function` was missing global pointers to the required libraries.
**Solution**: Ensure the `scope` object in `live-preview.tsx` includes all high-level dependencies.

## 9. `ReferenceError: Motion is not defined`
**Error**: `Motion is not defined` or `Lucide is not defined` inside the simulation.
**Cause**: The AI agent occasionally mis-capitalizes library names or assumes they are available as globals with slightly different names.
**Solution**: Added a comprehensive "Resilience Scope" in `live-preview.tsx` that provides common aliases:
- `motion` -> `Motion`, `framerMotion`, `FramerMotion`
- `LucideIcons` -> `Lucide`, `lucide`, `icons`
- `React` hooks are also available directly (e.g., `useState`).

## 10. Component Capture Failure ("No component captured")
**Error**: The simulation shows "No component captured" even though code was generated.
**Cause**: The AI sometimes writes the `App` component but forgets to call `renderComponent(App)`, or the call is stripped by sanitization filters.
**Solution**: Added an **Automatic Fallback** in the execution runner. If `renderComponent` hasn't been called after code execution, the system scans the scope for an `App` or `FallbackApp` function and automatically mounts it.
