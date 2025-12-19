import React, { useMemo } from 'react';

interface SoqlHighlighterProps {
  query: string;
}

// SOQL keywords to highlight
const KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE',
  'ORDER', 'BY', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
  'LIMIT', 'OFFSET', 'GROUP', 'HAVING', 'ROLLUP', 'CUBE',
  'WITH', 'DATA', 'CATEGORY', 'ABOVE', 'BELOW', 'ABOVE_OR_BELOW',
  'FOR', 'VIEW', 'REFERENCE', 'UPDATE', 'TRACKING', 'VIEWSTAT',
  'USING', 'SCOPE', 'TYPEOF', 'WHEN', 'THEN', 'ELSE', 'END',
  'INCLUDES', 'EXCLUDES', 'TRUE', 'FALSE', 'NULL', 'TODAY',
  'YESTERDAY', 'TOMORROW', 'LAST_WEEK', 'THIS_WEEK', 'NEXT_WEEK',
  'LAST_MONTH', 'THIS_MONTH', 'NEXT_MONTH', 'LAST_90_DAYS',
  'NEXT_90_DAYS', 'LAST_N_DAYS', 'NEXT_N_DAYS', 'THIS_QUARTER',
  'LAST_QUARTER', 'NEXT_QUARTER', 'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR',
  'THIS_FISCAL_QUARTER', 'LAST_FISCAL_QUARTER', 'NEXT_FISCAL_QUARTER',
  'THIS_FISCAL_YEAR', 'LAST_FISCAL_YEAR', 'NEXT_FISCAL_YEAR',
  'ALL', 'ROWS', 'SECURITY_ENFORCED', 'SYSTEM_MODE', 'USER_MODE'
];

// Aggregate functions
const FUNCTIONS = [
  'COUNT', 'COUNT_DISTINCT', 'SUM', 'AVG', 'MIN', 'MAX',
  'CALENDAR_MONTH', 'CALENDAR_QUARTER', 'CALENDAR_YEAR',
  'DAY_IN_MONTH', 'DAY_IN_WEEK', 'DAY_IN_YEAR', 'DAY_ONLY',
  'FISCAL_MONTH', 'FISCAL_QUARTER', 'FISCAL_YEAR',
  'HOUR_IN_DAY', 'WEEK_IN_MONTH', 'WEEK_IN_YEAR',
  'FORMAT', 'CONVERTCURRENCY', 'TOLABEL', 'CONVERT_TIMEZONE',
  'GROUPING', 'DISTANCE', 'GEOLOCATION'
];

// Operators
const OPERATORS = ['=', '!=', '<>', '<', '>', '<=', '>=', ':', '+', '-'];

// Token types
type TokenType = 'keyword' | 'function' | 'string' | 'number' | 'operator' | 'field' | 'object' | 'comment' | 'text';

interface Token {
  type: TokenType;
  value: string;
}

const tokenize = (query: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  
  // Track context for field/object detection
  let afterSelect = false;
  let afterFrom = false;
  let afterWhere = false;
  
  while (i < query.length) {
    // Whitespace
    if (/\s/.test(query[i])) {
      let whitespace = '';
      while (i < query.length && /\s/.test(query[i])) {
        whitespace += query[i];
        i++;
      }
      tokens.push({ type: 'text', value: whitespace });
      continue;
    }
    
    // Single-line comments (not really in SOQL, but good to handle)
    if (query.slice(i, i + 2) === '//') {
      let comment = '';
      while (i < query.length && query[i] !== '\n') {
        comment += query[i];
        i++;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }
    
    // Strings (single quotes in SOQL)
    if (query[i] === "'") {
      let str = query[i];
      i++;
      while (i < query.length && query[i] !== "'") {
        if (query[i] === '\\' && i + 1 < query.length) {
          str += query[i] + query[i + 1];
          i += 2;
        } else {
          str += query[i];
          i++;
        }
      }
      if (i < query.length) {
        str += query[i];
        i++;
      }
      tokens.push({ type: 'string', value: str });
      continue;
    }
    
    // Numbers (including decimals and negatives)
    if (/[0-9]/.test(query[i]) || (query[i] === '-' && /[0-9]/.test(query[i + 1] || ''))) {
      let num = '';
      if (query[i] === '-') {
        num += query[i];
        i++;
      }
      while (i < query.length && /[0-9.]/.test(query[i])) {
        num += query[i];
        i++;
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }
    
    // Operators
    if (OPERATORS.some(op => query.slice(i, i + op.length) === op)) {
      const op = OPERATORS.find(op => query.slice(i, i + op.length) === op)!;
      tokens.push({ type: 'operator', value: op });
      i += op.length;
      continue;
    }
    
    // Parentheses, commas, dots
    if ('(),.'.includes(query[i])) {
      tokens.push({ type: 'text', value: query[i] });
      i++;
      continue;
    }
    
    // Words (identifiers, keywords, functions)
    if (/[a-zA-Z_]/.test(query[i])) {
      let word = '';
      while (i < query.length && /[a-zA-Z0-9_]/.test(query[i])) {
        word += query[i];
        i++;
      }
      
      const upperWord = word.toUpperCase();
      
      // Track context
      if (upperWord === 'SELECT') afterSelect = true;
      if (upperWord === 'FROM') {
        afterSelect = false;
        afterFrom = true;
      }
      if (upperWord === 'WHERE' || upperWord === 'ORDER' || upperWord === 'GROUP' || upperWord === 'LIMIT') {
        afterFrom = false;
        if (upperWord === 'WHERE') afterWhere = true;
      }
      
      // Classify the word
      if (KEYWORDS.includes(upperWord)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (FUNCTIONS.includes(upperWord)) {
        tokens.push({ type: 'function', value: word });
      } else if (afterFrom && !afterWhere) {
        // Object name (right after FROM)
        tokens.push({ type: 'object', value: word });
        afterFrom = false;
      } else {
        // Field name or other identifier
        tokens.push({ type: 'field', value: word });
      }
      continue;
    }
    
    // Any other character
    tokens.push({ type: 'text', value: query[i] });
    i++;
  }
  
  return tokens;
};

const SoqlHighlighter: React.FC<SoqlHighlighterProps> = ({ query }) => {
  const highlightedContent = useMemo(() => {
    if (!query) return null;
    
    const tokens = tokenize(query);
    
    return tokens.map((token, index) => {
      switch (token.type) {
        case 'keyword':
          return <span key={index} className="text-purple-400 font-semibold">{token.value}</span>;
        case 'function':
          return <span key={index} className="text-yellow-400">{token.value}</span>;
        case 'string':
          return <span key={index} className="text-green-400">{token.value}</span>;
        case 'number':
          return <span key={index} className="text-orange-400">{token.value}</span>;
        case 'operator':
          return <span key={index} className="text-pink-400">{token.value}</span>;
        case 'field':
          return <span key={index} className="text-blue-300">{token.value}</span>;
        case 'object':
          return <span key={index} className="text-cyan-400 font-semibold">{token.value}</span>;
        case 'comment':
          return <span key={index} className="text-gray-500 italic">{token.value}</span>;
        default:
          return <span key={index}>{token.value}</span>;
      }
    });
  }, [query]);

  return (
    <pre 
      className="soql-highlight-layer absolute inset-0 pointer-events-none overflow-hidden whitespace-pre-wrap break-words"
      aria-hidden="true"
    >
      {highlightedContent}
      {/* Add a trailing space to match textarea behavior */}
      <span> </span>
    </pre>
  );
};

export default SoqlHighlighter;
