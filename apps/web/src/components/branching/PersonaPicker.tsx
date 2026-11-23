import { CLONE_SYSTEM_PERSONAS, type ModelPersona } from "@rakazo/contracts";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web";
import { Check, ChevronDown, Plus, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";

const CUSTOM_PERSONAS_KEY = "clone:custom-personas:v1";

function loadCustomPersonas(): ModelPersona[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PERSONAS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ModelPersona[]) : [];
  } catch {
    return [];
  }
}

function saveCustomPersonas(items: ModelPersona[]) {
  try {
    localStorage.setItem(CUSTOM_PERSONAS_KEY, JSON.stringify(items));
  } catch {
    // ignore storage quota errors
  }
}

export function PersonaPicker({
  selectedPersonaId,
  onSelectPersona,
}: {
  selectedPersonaId: string;
  onSelectPersona: (persona: ModelPersona) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customPersonas, setCustomPersonas] = useState<ModelPersona[]>(() => loadCustomPersonas());
  const [creating, setCreating] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [taglineDraft, setTaglineDraft] = useState("");
  const [promptDraft, setPromptDraft] = useState("");

  useEffect(() => {
    saveCustomPersonas(customPersonas);
  }, [customPersonas]);

  const allPersonas: ModelPersona[] = [...CLONE_SYSTEM_PERSONAS, ...customPersonas];
  const active = allPersonas.find((p) => p.id === selectedPersonaId) ?? CLONE_SYSTEM_PERSONAS[0]!;

  function handleCreateCustom() {
    const name = nameDraft.trim();
    const prompt = promptDraft.trim();
    if (!name || !prompt) return;
    const created: ModelPersona = {
      id: `custom-${Date.now()}`,
      name,
      tagline: taglineDraft.trim() || "Custom persona",
      category: "general",
      source: "custom",
      systemPrompt: prompt,
    };
    setCustomPersonas((prev) => [...prev, created]);
    onSelectPersona(created);
    setNameDraft("");
    setTaglineDraft("");
    setPromptDraft("");
    setCreating(false);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-testid="persona-picker"
            aria-label={`Model Persona: ${active.name}`}
            className="inline-flex h-7 max-w-[170px] items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
          />
        }
      >
        <User className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{active.name}</span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[300px] rounded-xl border border-border bg-popover p-0 shadow-xl"
      >
        <div className="border-b border-border px-3 py-2">
          <div className="text-xs font-semibold text-foreground">Model Persona</div>
          <p className="text-[10px] text-muted-foreground">
            Choose a persona for this reply or conversation
          </p>
        </div>

        {creating ? (
          <div className="space-y-2 p-3">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Persona name (e.g. Pitch Deck Coach)"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-ring"
            />
            <input
              type="text"
              value={taglineDraft}
              onChange={(e) => setTaglineDraft(e.target.value)}
              placeholder="Short description (optional)"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-ring"
            />
            <textarea
              rows={3}
              maxLength={8_000}
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              placeholder="Role, expertise, process, output format & guardrails..."
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-ring"
            />
            <div className="flex items-center justify-end gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCreating(false)}
                className="h-7 px-2 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!nameDraft.trim() || !promptDraft.trim()}
                onClick={handleCreateCustom}
                className="h-7 px-2.5 text-xs"
              >
                Save Persona
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rk-scroll max-h-72 overflow-y-auto p-1.5">
              {allPersonas.map((persona) => {
                const isActive = persona.id === active.id;
                return (
                  <div
                    key={persona.id}
                    className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                      isActive ? "bg-success/10" : "hover:bg-muted/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPersona(persona);
                        setOpen(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-foreground">
                          {persona.name}
                        </span>
                        <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                          {persona.source === "system" ? "System" : "Custom"}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                        {persona.tagline}
                      </p>
                    </button>
                    {persona.source === "custom" ? (
                      <button
                        type="button"
                        aria-label={`Delete ${persona.name}`}
                        onClick={() => {
                          setCustomPersonas((prev) => prev.filter((p) => p.id !== persona.id));
                          if (isActive) onSelectPersona(CLONE_SYSTEM_PERSONAS[0]!);
                        }}
                        className="mt-0.5 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    ) : isActive ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border p-1.5">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Plus className="size-3.5" />
                <span>Create Custom Persona</span>
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
