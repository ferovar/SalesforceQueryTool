import React, { useMemo } from 'react';

interface ApexHighlighterProps {
  code: string;
  className?: string;
}

// Apex keywords
const KEYWORDS = [
  'abstract', 'after', 'as', 'asc', 'before', 'break', 'bulk', 'by', 'catch',
  'class', 'commit', 'const', 'continue', 'convertcurrency', 'delete', 'desc',
  'do', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'from',
  'get', 'global', 'goto', 'group', 'having', 'hint', 'if', 'implements',
  'import', 'in', 'inner', 'insert', 'instanceof', 'interface', 'into', 'join',
  'last_90_days', 'last_month', 'last_n_days', 'last_week', 'like', 'limit',
  'list', 'loop', 'map', 'merge', 'new', 'next_90_days', 'next_month',
  'next_n_days', 'next_week', 'not', 'null', 'nulls', 'number', 'offset', 'on',
  'or', 'order', 'outer', 'override', 'package', 'parallel', 'private',
  'protected', 'public', 'return', 'returning', 'rollback', 'savepoint',
  'search', 'select', 'set', 'sharing', 'short', 'sort', 'stat', 'static',
  'super', 'switch', 'testmethod', 'then', 'this', 'this_month', 'this_week',
  'throw', 'today', 'tolabel', 'tomorrow', 'transient', 'trigger', 'true',
  'try', 'typeof', 'undelete', 'update', 'upsert', 'using', 'virtual', 'void',
  'webservice', 'when', 'where', 'while', 'with', 'without', 'yesterday'
];

// Built-in types
const TYPES = [
  'Boolean', 'Date', 'Datetime', 'Decimal', 'Double', 'ID', 'Integer', 'Long',
  'Object', 'String', 'Time', 'Blob', 'SObject', 'List', 'Set', 'Map',
  'Exception', 'ApexPages', 'Database', 'Schema', 'Messaging', 'System',
  'Test', 'UserInfo', 'Limits', 'JSON', 'Http', 'HttpRequest', 'HttpResponse',
  'RestContext', 'RestRequest', 'RestResponse', 'Account', 'Contact', 'Lead',
  'Opportunity', 'Case', 'Task', 'Event', 'User', 'Profile', 'PermissionSet'
];

// Common Apex methods/classes
const BUILTINS = [
  'System.debug', 'System.assertEquals', 'System.assertNotEquals', 'System.assert',
  'System.abortJob', 'System.enqueueJob', 'System.runAs', 'System.schedule',
  'Debug', 'Assert', 'QueryLocator', 'Database.executeBatch', 'Database.insert',
  'Database.update', 'Database.delete', 'Database.upsert', 'Database.query',
  'Test.startTest', 'Test.stopTest', 'Test.setMock', 'Test.isRunningTest',
  'Trigger.new', 'Trigger.old', 'Trigger.newMap', 'Trigger.oldMap',
  'Trigger.isInsert', 'Trigger.isUpdate', 'Trigger.isDelete', 'Trigger.isBefore',
  'Trigger.isAfter', 'JSON.serialize', 'JSON.deserialize', 'JSON.deserializeStrict'
];

type TokenType = 'keyword' | 'type' | 'builtin' | 'string' | 'number' | 'operator' | 
                  'comment' | 'annotation' | 'method' | 'punctuation' | 'text';

interface Token {
  type: TokenType;
  value: string;
}

const tokenize = (code: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;

  while (i < code.length) {
    // Whitespace
    if (/\s/.test(code[i])) {
      let whitespace = '';
      while (i < code.length && /\s/.test(code[i])) {
        whitespace += code[i];
        i++;
      }
      tokens.push({ type: 'text', value: whitespace });
      continue;
    }

    // Single-line comments
    if (code.slice(i, i + 2) === '//') {
      let comment = '';
      while (i < code.length && code[i] !== '\n') {
        comment += code[i];
        i++;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }

    // Multi-line comments
    if (code.slice(i, i + 2) === '/*') {
      let comment = '/*';
      i += 2;
      while (i < code.length && code.slice(i, i + 2) !== '*/') {
        comment += code[i];
        i++;
      }
      if (i < code.length) {
        comment += '*/';
        i += 2;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }

    // Strings (single quotes)
    if (code[i] === "'") {
      let str = code[i];
      i++;
      while (i < code.length && code[i] !== "'") {
        if (code[i] === '\\' && i + 1 < code.length) {
          str += code[i] + code[i + 1];
          i += 2;
        } else {
          str += code[i];
          i++;
        }
      }
      if (i < code.length) {
        str += code[i];
        i++;
      }
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Annotations (@isTest, @future, etc.)
    if (code[i] === '@') {
      let annotation = '@';
      i++;
      while (i < code.length && /[a-zA-Z]/.test(code[i])) {
        annotation += code[i];
        i++;
      }
      tokens.push({ type: 'annotation', value: annotation });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(code[i]) || (code[i] === '-' && /[0-9]/.test(code[i + 1] || ''))) {
      let num = '';
      if (code[i] === '-') {
        num += code[i];
        i++;
      }
      while (i < code.length && /[0-9.LlDd]/.test(code[i])) {
        num += code[i];
        i++;
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Operators and punctuation
    const operators = ['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', 
                       '=>', '::', '=', '<', '>', '+', '-', '*', '/', '%', '!', '&', '|', '^', '~',
                       '(', ')', '{', '}', '[', ']', ';', ':', ',', '.', '?'];
    let matched = false;
    for (const op of operators) {
      if (code.slice(i, i + op.length) === op) {
        tokens.push({ type: 'punctuation', value: op });
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Words (identifiers, keywords, types)
    if (/[a-zA-Z_]/.test(code[i])) {
      let word = '';
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
        word += code[i];
        i++;
      }

      // Check for dot notation (e.g., System.debug)
      const lowerWord = word.toLowerCase();
      const combinedWord = word + (code[i] === '.' ? '.' + code.slice(i + 1).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)?.[0] : '');
      
      if (BUILTINS.some(b => b.toLowerCase() === combinedWord.toLowerCase())) {
        // Match the full dotted expression
        const fullMatch = combinedWord;
        tokens.push({ type: 'builtin', value: fullMatch });
        i += fullMatch.length - word.length;
      } else if (KEYWORDS.includes(lowerWord)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (TYPES.includes(word) || TYPES.map(t => t.toLowerCase()).includes(lowerWord)) {
        tokens.push({ type: 'type', value: word });
      } else if (code[i] === '(') {
        // It's a method call
        tokens.push({ type: 'method', value: word });
      } else {
        tokens.push({ type: 'text', value: word });
      }
      continue;
    }

    // Any other character
    tokens.push({ type: 'text', value: code[i] });
    i++;
  }

  return tokens;
};

const getTokenColor = (type: TokenType): string => {
  switch (type) {
    case 'keyword':
      return 'text-purple-400';
    case 'type':
      return 'text-cyan-400';
    case 'builtin':
      return 'text-yellow-400';
    case 'string':
      return 'text-green-400';
    case 'number':
      return 'text-orange-400';
    case 'comment':
      return 'text-gray-500 italic';
    case 'annotation':
      return 'text-yellow-300';
    case 'method':
      return 'text-blue-400';
    case 'punctuation':
      return 'text-discord-text-muted';
    default:
      return 'text-discord-text';
  }
};

export const ApexHighlighter: React.FC<ApexHighlighterProps> = ({ code, className = '' }) => {
  const tokens = useMemo(() => tokenize(code), [code]);

  return (
    <pre className={`font-mono text-sm whitespace-pre-wrap break-words ${className}`}>
      {tokens.map((token, index) => (
        <span key={index} className={getTokenColor(token.type)}>
          {token.value}
        </span>
      ))}
    </pre>
  );
};

export default ApexHighlighter;
