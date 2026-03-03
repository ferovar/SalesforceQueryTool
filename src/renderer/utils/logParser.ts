/**
 * Shared Apex debug log parser — used by AnonymousApexModal and UserDebuggingTab.
 */

export type LogLineType =
  | 'debug'
  | 'error'
  | 'warning'
  | 'info'
  | 'user-debug'
  | 'system'
  | 'dml'
  | 'soql'
  | 'limit'
  | 'default';

export interface ParsedLogLine {
  timestamp: string;
  type: LogLineType;
  category: string;
  content: string;
  raw: string;
}

/**
 * Parse a raw Salesforce debug log string into structured, typed lines.
 */
export function parseDebugLog(log: string): ParsedLogLine[] {
  const lines = log.split('\n');
  return lines.map(line => {
    const raw = line;
    let type: LogLineType = 'default';
    let timestamp = '';
    let category = '';
    let content = line;

    // Format: HH:MM:SS.mmm (xxxxxxxx)|CATEGORY|...
    const match = line.match(/^(\d{2}:\d{2}:\d{2}\.\d+)\s*\((\d+)\)\|([^|]+)\|(.*)$/);
    if (match) {
      timestamp = match[1];
      category = match[3];
      content = match[4];

      if (category === 'USER_DEBUG') {
        type = 'user-debug';
      } else if (category.includes('ERROR') || category.includes('FATAL') || category.includes('EXCEPTION')) {
        type = 'error';
      } else if (category.includes('WARN')) {
        type = 'warning';
      } else if (category === 'SYSTEM_MODE_ENTER' || category === 'SYSTEM_MODE_EXIT' || category.includes('SYSTEM')) {
        type = 'system';
      } else if (category.includes('DML') || category.includes('INSERT') || category.includes('UPDATE') || category.includes('DELETE')) {
        type = 'dml';
      } else if (category.includes('SOQL') || category.includes('QUERY')) {
        type = 'soql';
      } else if (category.includes('LIMIT') || category.includes('CUMULATIVE')) {
        type = 'limit';
      } else if (category === 'CODE_UNIT_STARTED' || category === 'CODE_UNIT_FINISHED') {
        type = 'info';
      }
    } else if (line.includes('DEBUG|') || line.includes('System.debug')) {
      type = 'user-debug';
    } else if (line.toLowerCase().includes('error') || line.toLowerCase().includes('exception')) {
      type = 'error';
    }

    return { timestamp, type, category, content, raw };
  });
}

/**
 * Map a log line type to a Tailwind color class.
 */
export function getLogLineColor(type: LogLineType): string {
  switch (type) {
    case 'user-debug': return 'text-cyan-400';
    case 'error': return 'text-red-400';
    case 'warning': return 'text-yellow-400';
    case 'info': return 'text-blue-400';
    case 'dml': return 'text-purple-400';
    case 'soql': return 'text-green-400';
    case 'limit': return 'text-orange-400';
    case 'system': return 'text-gray-500';
    default: return 'text-discord-text-muted';
  }
}
