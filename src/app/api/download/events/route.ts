import { activeDownloads } from "@/lib/download-manager";

export const dynamic = "force-dynamic";

export async function GET() {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            const send = (data: string) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                    // stream closed
                }
            };

            const interval = setInterval(() => {
                const jobs: Record<string, { status: string; progress: number; error?: string }> = {};
                for (const [id, job] of activeDownloads) {
                    jobs[id] = {
                        status: job.status,
                        progress: job.progress,
                        error: job.error,
                    };
                }
                send(JSON.stringify(jobs));
            }, 1000);

            const heartbeat = setInterval(() => {
                send(JSON.stringify({ _heartbeat: true }));
            }, 15000);

            const cleanup = () => {
                clearInterval(interval);
                clearInterval(heartbeat);
            };

            // Abort signal from the request will close the stream
            // ReadableStream cancel() is called when the client disconnects
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ _connected: true })}\n\n`));

            // Store cleanup for cancel
            (controller as any)._cleanup = cleanup;
        },
        cancel() {
            if ((this as any)._cleanup) (this as any)._cleanup();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
