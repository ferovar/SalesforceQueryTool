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

// Operators (including punctuation like commas and periods)
const OPERATORS = ['=', '!=', '<>', '<', '>', '<=', '>=', ':', '+', '-', ',', '.', '(', ')'];

// Token types
type TokenType = 'keyword' | 'function' | 'string' | 'number' | 'operator' | 'field' | 'object' | 'comment' | 'punctuation' | 'text';

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
    
    // Operators (including commas, periods, parentheses)
    if (OPERATORS.some(op => query.slice(i, i + op.length) === op)) {
      const op = OPERATORS.find(op => query.slice(i, i + op.length) === op)!;
      tokens.push({ type: 'operator', value: op });
      i += op.length;
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
      let color = '#dbdee1';
      let fontWeight: number | undefined;
      let fontStyle: string | undefined;
      
      switch (token.type) {
        case 'keyword':
          color = '#c084fc';
          fontWeight = 600;
          break;
        case 'function':
          color = '#facc15';
          break;
        case 'string':
          color = '#4ade80';
          break;
        case 'number':
          color = '#fb923c';
          break;
        case 'operator':
          color = '#f472b6';
          break;
        case 'field':
          color = '#93c5fd';
          break;
        case 'object':
          color = '#22d3ee';
          fontWeight = 600;
          break;
        case 'comment':
          color = '#6b7280';
          fontStyle = 'italic';
          break;
        case 'text':
          color = '#dbdee1';
          break;
      }
      
      return (
        <span 
          key={index} 
          style={{ color, fontWeight, fontStyle }}
        >
          {token.value}
        </span>
      );
    });
  }, [query]);

  return (
    <pre 
      className="soql-highlight-layer whitespace-pre-wrap break-words"
      style={{ 
        color: '#dbdee1', 
        margin: 0, 
        minHeight: '100%', 
        width: '100%'
      }}
      aria-hidden="true"
    >
      {highlightedContent}
    </pre>
  );
};

export default SoqlHighlighter;
