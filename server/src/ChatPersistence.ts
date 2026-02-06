import fs from "fs";
import path from "path";
import type { ChatMessage } from "./types";
import { log } from "./utils";

const DATA_DIR = "data/chats";

export class ChatPersistence {
  private buffer: ChatMessage[] = [];

  constructor() {
    // Ensure base data dir exists
    const dirPath = path.resolve(DATA_DIR);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Flush buffer every 5 seconds
    setInterval(() => {
      this.flush();
    }, 5000);
  }

  private getRefDate(timestamp?: number): string {
    const date = timestamp ? new Date(timestamp) : new Date();
    return date.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  private getFilePath(roomId: string, dateStr: string): string {
    // Sanitize roomId
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9\-_]/g, "_");
    const fileName = (safeRoomId || "unknown") + ".jsonl";
    return path.resolve(DATA_DIR, dateStr, fileName);
  }

  private ensureDateDir(dateStr: string) {
    const dirPath = path.resolve(DATA_DIR, dateStr);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  saveMessage(message: ChatMessage) {
    this.buffer.push(message);
  }

  private flush() {
    if (this.buffer.length === 0) return;

    const messagesToSave = [...this.buffer];
    this.buffer = [];

    // Group messages by file path to minimize file opens
    const messagesByFile = new Map<string, string[]>();

    for (const message of messagesToSave) {
      try {
        const dateStr = this.getRefDate(message.timestamp);
        this.ensureDateDir(dateStr);
        const filePath = this.getFilePath(message.roomId, dateStr);

        if (!messagesByFile.has(filePath)) {
          messagesByFile.set(filePath, []);
        }
        const line = JSON.stringify(message) + "\n";
        messagesByFile.get(filePath)!.push(line);
      } catch (error) {
        console.error(
          `[ChatPersistence] Error preparing message for room ${message.roomId}:`,
          error,
        );
      }
    }

    // Write to files
    for (const [filePath, lines] of messagesByFile.entries()) {
      try {
        fs.appendFileSync(filePath, lines.join(""), "utf-8");
        log(`[ChatPersistence] Wrote ${lines.length} messages to ${filePath}`);
      } catch (error) {
        console.error(
          `[ChatPersistence] Error writing to file ${filePath}:`,
          error,
        );
      }
    }
  }

  getRecentMessages(roomId: string, limit: number = 20): ChatMessage[] {
    try {
      const allMessages: ChatMessage[] = [];

      // Get all date directories, sorted newest first
      if (!fs.existsSync(path.resolve(DATA_DIR))) {
        return [];
      }

      const dateDirs = fs
        .readdirSync(path.resolve(DATA_DIR))
        .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)) // Simple YYYY-MM-DD check
        .sort()
        .reverse();

      for (const dateStr of dateDirs) {
        if (allMessages.length >= limit) break;

        const filePath = this.getFilePath(roomId, dateStr);
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, "utf-8");
          const lines = fileContent.split("\n").filter((line) => line.trim());

          // Parse messages from this file
          const msgsInFile: ChatMessage[] = lines
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter((msg): msg is ChatMessage => msg !== null);

          // We need the NEWEST messages.
          // If we are iterating dates Newest -> Oldest,
          // and within a file lines are Oldest -> Newest (append only).
          // We should take messages from the END of the file first.

          // Reverse messages from file so [0] is newest in that file
          msgsInFile.reverse();

          allMessages.push(...msgsInFile);
        }
      }

      // We might have more than limit now
      const result = allMessages.slice(0, limit);

      // The caller expects chronological order (Oldest -> Newest)
      // currently 'result' is [Newest -> Oldest]
      result.reverse();

      return result;
    } catch (error) {
      console.error(
        `[ChatPersistence] Error loading messages for room ${roomId}:`,
        error,
      );
      return [];
    }
  }
}

export const chatPersistence = new ChatPersistence();
