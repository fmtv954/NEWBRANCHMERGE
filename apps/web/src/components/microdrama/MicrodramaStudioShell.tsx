import type { CharacterRef, Episode, Scene, Shot } from "@rakazo/contracts";
import {
  Badge,
  Button,
  Card,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@rakazo/ui-web";
import { AlertTriangle, Film, Plus, Users } from "lucide-react";
import { useState } from "react";

export function MicrodramaStudioShell({
  episode,
  characters,
  scenes,
  shots,
  approvedSpendMicros,
  onCreateCharacter,
  onPinCharacterToContext,
}: {
  episode: Episode | null;
  characters: readonly CharacterRef[];
  scenes: readonly Scene[];
  shots: readonly Shot[];
  approvedSpendMicros: string;
  onCreateCharacter: (input: {
    stableCode: string;
    name: string;
    wardrobeNotes: string;
  }) => Promise<void>;
  onPinCharacterToContext: (char: CharacterRef) => void;
}) {
  const [tab, setTab] = useState("cast");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newWardrobe, setNewWardrobe] = useState("");

  const approvedDollars = (Number(approvedSpendMicros) / 1_000_000).toFixed(2);
  const staleTakeCount = shots.filter((s) => Object.values(s.staleFlags).some(Boolean)).length;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-body-lg font-medium text-foreground">
            <Film className="size-4 text-success" />
            <span className="truncate">{episode?.title ?? "Microdrama Studio"}</span>
          </div>
          <div className="text-label text-muted-foreground">
            {episode?.aspectRatio ?? "9:16"} · Approved spend ${approvedDollars}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          V2 Shell
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1">
        <TabsList className="grid w-full grid-cols-3 gap-1">
          <TabsTrigger value="script" className="text-label">
            Script
          </TabsTrigger>
          <TabsTrigger value="cast" className="text-label">
            Cast & Props
          </TabsTrigger>
          <TabsTrigger value="shots" className="text-label">
            Shots ({shots.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="script" className="mt-3 space-y-2">
          <Card className="p-3 text-body-sm text-muted-foreground">
            Highlight any line in chat to branch dialogue or run the V2 Director Pass once Phases
            10–13 activate.
          </Card>
          <Button type="button" size="sm" variant="outline" disabled className="w-full">
            Run Director Pass (V2 Pipeline)
          </Button>
        </TabsContent>

        <TabsContent value="cast" className="mt-3 space-y-3">
          <div className="space-y-2 rounded-lg border border-border p-2.5">
            <div className="flex items-center gap-1.5 text-label font-medium text-foreground">
              <Users className="size-3.5" />
              Add character reference
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="CHAR_TONYA"
                className="h-7 text-label"
              />
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tonya"
                className="h-7 text-label"
              />
            </div>
            <Input
              value={newWardrobe}
              onChange={(e) => setNewWardrobe(e.target.value)}
              placeholder="Wardrobe / continuity notes"
              className="h-7 text-label"
            />
            <Button
              type="button"
              size="sm"
              className="h-7 w-full text-label"
              disabled={!newCode.trim() || !newName.trim()}
              onClick={async () => {
                await onCreateCharacter({
                  stableCode: newCode.trim(),
                  name: newName.trim(),
                  wardrobeNotes: newWardrobe.trim(),
                });
                setNewCode("");
                setNewName("");
                setNewWardrobe("");
              }}
            >
              <Plus className="mr-1 size-3" />
              Save Character Ref
            </Button>
          </div>

          <div className="space-y-2">
            {characters.map((c) => (
              <Card key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-body-sm font-medium text-foreground">
                    {c.name}{" "}
                    <span className="text-label text-muted-foreground">({c.stableCode})</span>
                  </div>
                  {c.wardrobeNotes ? (
                    <div className="truncate text-label text-muted-foreground">
                      {c.wardrobeNotes}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-label"
                  onClick={() => onPinCharacterToContext(c)}
                >
                  Pin Context
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="shots" className="mt-3 space-y-2">
          {staleTakeCount > 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-label text-warning">
              <AlertTriangle className="size-3.5 shrink-0" />
              {staleTakeCount} shot(s) have stale audio/lip-sync takes needing review.
            </div>
          ) : null}
          {scenes.length === 0 ? (
            <Card className="p-3 text-body-sm text-muted-foreground">
              No scenes yet. Create shots manually or run the V2 Director Pass.
            </Card>
          ) : (
            shots.map((s) => (
              <Card key={s.id} className="px-3 py-2 text-body-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{s.stableShotCode}</span>
                  <span className="text-label text-muted-foreground">
                    {s.cameraLens} · {s.durationSec}s
                  </span>
                </div>
                {s.intent ? (
                  <p className="mt-1 text-label text-muted-foreground">{s.intent}</p>
                ) : null}
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
