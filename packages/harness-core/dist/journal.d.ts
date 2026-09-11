/** Existing Markdown day files; no migration or alternate event store. */
export declare const JOURNAL_KINDS: readonly ["decision", "verdict", "run", "error", "block"];
export type JournalKind = typeof JOURNAL_KINDS[number];
export interface JournalEvent {
    time: string;
    kind: JournalKind;
    text: string;
    ref: string;
}
export type JournalLine = ({
    status: 'parsed';
    raw: string;
} & JournalEvent) | {
    status: 'unparsed';
    raw: string;
};
export interface JournalIo {
    read(path: string): string;
    append(path: string, body: string): void;
}
export declare function formatLine(event: JournalEvent): string;
export declare function parseLine(raw: string): JournalLine;
/** Inclusive UTC window ending on at; week means the trailing seven calendar days. */
export declare function selectWindow(days: readonly string[], at: string, week: boolean): string[];
/** The receipt is based on bytes read AFTER append, never on append returning normally. */
export declare function appendWitnessed(io: JournalIo, path: string, line: string): void;
//# sourceMappingURL=journal.d.ts.map