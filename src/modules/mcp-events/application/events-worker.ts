import type { McpEventsRepository } from "../domain/ports";
import type { DeliveryDispatcher } from "./delivery-dispatcher";
import type { EventEnqueuer } from "./event-enqueuer";

const retentionMs = 7 * 24 * 60 * 60 * 1000;

/** One cron tick: queue deliveries for new articles, send the due ones, prune old rows. */
export class McpEventsWorker {
  constructor(
    private readonly enqueuer: EventEnqueuer,
    private readonly dispatcher: DeliveryDispatcher,
    private readonly repository: McpEventsRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run() {
    const enqueue = await this.enqueuer.run();
    const dispatch = await this.dispatcher.run();
    await this.repository.prune(new Date(this.clock().getTime() - retentionMs));
    return { enqueue, dispatch };
  }
}
