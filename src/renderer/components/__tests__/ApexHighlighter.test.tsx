import React from 'react';
import { render, screen } from '@testing-library/react';
import ApexHighlighter from '../ApexHighlighter';

describe('ApexHighlighter', () => {
  describe('keyword highlighting', () => {
    it('should highlight Apex keywords in purple', () => {
      const code = 'public class MyClass {}';
      const { container } = render(<ApexHighlighter code={code} />);

      const keywordSpans = container.querySelectorAll('.text-purple-400');
      expect(keywordSpans.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('public');
      expect(container.textContent).toContain('class');
    });

    it('should highlight control flow keywords', () => {
      const code = 'if (x > 0) { return true; } else { return false; }';
      const { container } = render(<ApexHighlighter code={code} />);

      const keywordSpans = container.querySelectorAll('.text-purple-400');
      expect(keywordSpans.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('if');
      expect(container.textContent).toContain('return');
      expect(container.textContent).toContain('else');
    });

    it('should highlight loop keywords', () => {
      const code = 'for (Integer i = 0; i < 10; i++) { while (true) { break; } }';
      const { container } = render(<ApexHighlighter code={code} />);

      expect(container.textContent).toContain('for');
      expect(container.textContent).toContain('while');
      expect(container.textContent).toContain('break');
    });
  });

  describe('type highlighting', () => {
    it('should highlight primitive types in cyan', () => {
      const code = 'String name; Integer count; Boolean flag;';
      const { container } = render(<ApexHighlighter code={code} />);

      const typeSpans = container.querySelectorAll('.text-cyan-400');
      expect(typeSpans.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('String');
      expect(container.textContent).toContain('Integer');
      expect(container.textContent).toContain('Boolean');
    });

    it('should highlight Salesforce types', () => {
      const code = 'Account acc; Contact con; List<String> items;';
      const { container } = render(<ApexHighlighter code={code} />);

      expect(container.textContent).toContain('Account');
      expect(container.textContent).toContain('Contact');
      expect(container.textContent).toContain('List');
    });
  });

  describe('built-in highlighting', () => {
    it('should highlight System methods in yellow', () => {
      const code = 'System.debug("test"); System.assertEquals(1, 1);';
      const { container } = render(<ApexHighlighter code={code} />);

      const builtinSpans = container.querySelectorAll('.text-yellow-300');
      expect(builtinSpans.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('System.debug');
      expect(container.textContent).toContain('System.assertEquals');
    });

    it('should highlight Database methods', () => {
      const code = 'Database.insert(records); Database.query(soql);';
      const { container } = render(<ApexHighlighter code={code} />);

      expect(container.textContent).toContain('Database.insert');
      expect(container.textContent).toContain('Database.query');
    });

    it('should highlight Test methods', () => {
      const code = 'Test.startTest(); Test.stopTest();';
      const { container } = render(<ApexHighlighter code={code} />);

      expect(container.textContent).toContain('Test.startTest');
      expect(container.textContent).toContain('Test.stopTest');
    });
  });

  describe('string highlighting', () => {
    it('should highlight double-quoted strings in green', () => {
      const code = 'String msg = "Hello World";';
      const { container } = render(<ApexHighlighter code={code} />);

      const stringSpans = container.querySelectorAll('.text-green-400');
      expect(stringSpans.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('"Hello World"');
    });

    it('should highlight single-quoted strings', () => {
      const code = "String msg = 'Hello World';";
      const { container } = render(<ApexHighlighter code={code} />);

      const stringSpans = container.querySelectorAll('.text-green-400');
      expect(stringSpans.length).toBeGreaterThan(0);
    });

    it('should handle strings with escaped quotes', () => {
      const code = 'String msg = "He said \\"Hello\\"";';
      const { container } = render(<ApexHighlighter code={code} />);

      const stringSpans = container.querySelectorAll('.text-green-400');
      expect(stringSpans.length).toBeGreaterThan(0);
    });
  });

  describe('number highlighting', () => {
    it('should highlight integers in orange', () => {
      const code = 'Integer count = 42;';
      const { container } = render(<ApexHighlighter code={code} />);

      const numberSpans = container.querySelectorAll('.text-orange-400');
      expect(numberSpans.length).toBeGreaterThan(0);
    });

    it('should highlight decimals', () => {
      const code = 'Decimal price = 19.99;';
      const { container } = render(<ApexHighlighter code={code} />);

      const numberSpans = container.querySelectorAll('.text-orange-400');
      expect(numberSpans.length).toBeGreaterThan(0);
    });
  });

  describe('comment highlighting', () => {
    it('should highlight single-line comments in gray', () => {
      const code = '// This is a comment\nInteger x = 1;';
      const { container } = render(<ApexHighlighter code={code} />);

      const commentSpans = container.querySelectorAll('.text-gray-500');
      expect(commentSpans.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('// This is a comment');
    });

    it('should highlight multi-line comments', () => {
      const code = '/* This is a\nmulti-line comment */\nInteger x = 1;';
      const { container } = render(<ApexHighlighter code={code} />);

      const commentSpans = container.querySelectorAll('.text-gray-500');
      expect(commentSpans.length).toBeGreaterThan(0);
    });
  });

  describe('annotation highlighting', () => {
    it('should highlight annotations in bright yellow', () => {
      const code = '@isTest\npublic class MyTest {}';
      const { container } = render(<ApexHighlighter code={code} />);

      const annotationSpans = container.querySelectorAll('.text-yellow-400');
      expect(annotationSpans.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('@isTest');
    });

    it('should highlight REST annotations', () => {
      const code = '@RestResource\n@HttpGet\npublic static void doGet() {}';
      const { container } = render(<ApexHighlighter code={code} />);

      expect(container.textContent).toContain('@RestResource');
      expect(container.textContent).toContain('@HttpGet');
    });
  });

  describe('method highlighting', () => {
    it('should highlight method calls in blue', () => {
      const code = 'myObject.myMethod();';
      const { container } = render(<ApexHighlighter code={code} />);

      const methodSpans = container.querySelectorAll('.text-blue-400');
      expect(methodSpans.length).toBeGreaterThan(0);
    });
  });

  describe('complex code', () => {
    it('should highlight a complete class', () => {
      const code = `
public class AccountService {
    // Get account by ID
    public static Account getAccount(Id accountId) {
        return [SELECT Id, Name FROM Account WHERE Id = :accountId];
    }
    
    @isTest
    private static void testGetAccount() {
        Account acc = new Account(Name = 'Test');
        insert acc;
        
        Test.startTest();
        Account result = getAccount(acc.Id);
        Test.stopTest();
        
        System.assertEquals('Test', result.Name);
    }
}`;
      const { container } = render(<ApexHighlighter code={code} />);

      // Should have multiple token types
      expect(container.querySelectorAll('.text-purple-400').length).toBeGreaterThan(0); // keywords
      expect(container.querySelectorAll('.text-cyan-400').length).toBeGreaterThan(0); // types
      expect(container.querySelectorAll('.text-green-400').length).toBeGreaterThan(0); // strings
      expect(container.querySelectorAll('.text-gray-500').length).toBeGreaterThan(0); // comments
      expect(container.querySelectorAll('.text-yellow-400').length).toBeGreaterThan(0); // annotations
    });

    it('should handle empty code', () => {
      const { container } = render(<ApexHighlighter code="" />);
      expect(container.textContent).toBe('');
    });

    it('should preserve whitespace and newlines', () => {
      const code = 'public class Test {\n    Integer x = 1;\n}';
      const { container } = render(<ApexHighlighter code={code} />);

      expect(container.textContent).toContain('\n');
    });
  });

  describe('edge cases', () => {
    it('should handle code with only operators', () => {
      const code = '+ - * / = == != < > <= >=';
      const { container } = render(<ApexHighlighter code={code} />);

      expect(container.textContent).toContain('+');
      expect(container.textContent).toContain('-');
    });

    it('should handle mixed case keywords', () => {
      const code = 'PUBLIC CLASS Test {}';
      const { container } = render(<ApexHighlighter code={code} />);

      // Keywords should still be recognized (case-insensitive)
      expect(container.textContent).toContain('PUBLIC');
      expect(container.textContent).toContain('CLASS');
    });

    it('should handle Unicode characters', () => {
      const code = 'String name = "Café ☕";';
      const { container } = render(<ApexHighlighter code={code} />);

      expect(container.textContent).toContain('Café ☕');
    });
  });
});
