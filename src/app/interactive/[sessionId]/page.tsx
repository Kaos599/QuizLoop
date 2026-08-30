import { PedagogicalWorkspace } from "@/components/pedagogical-workspace";

export default async function InteractiveSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
    const { sessionId } = await params;
    return <PedagogicalWorkspace sessionId={sessionId} />;
}
