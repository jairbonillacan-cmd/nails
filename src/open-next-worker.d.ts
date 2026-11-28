declare module '*/.open-next/worker.js' {
  interface OpenNextWorkerModule {
    fetch(
      request: Request,
      env: Record<string, unknown>,
      ctx: {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException(): void;
      },
    ): Promise<Response>;
  }
  const openNextHandler: OpenNextWorkerModule;
  export default openNextHandler;
}
