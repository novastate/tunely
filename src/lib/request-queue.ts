/**
 * Request queue with max concurrency to prevent rate limit bursts.
 * Used for external API calls (Spotify, Last.fm) during cold cache scenarios.
 */
class RequestQueue {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private maxConcurrent = 10) {}

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.processQueue();
        }
      };

      if (this.running < this.maxConcurrent) {
        execute();
      } else {
        this.queue.push(() => { execute(); });
      }
    });
  }

  private processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const fn = this.queue.shift()!;
      fn();
    }
  }
}

/** Shared queue for all external API requests */
export const requestQueue = new RequestQueue(10);
