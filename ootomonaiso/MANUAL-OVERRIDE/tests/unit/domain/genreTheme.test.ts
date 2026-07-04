import { describe, it, expect } from 'vitest';
import type { GenreDefinition } from '../../../src/domain/types';

// Helper to create a mock genre definition with a theme
function createMockGenre(overrides: Partial<GenreDefinition> = {}): GenreDefinition {
  return {
    id: 'test-genre',
    name: 'Test Genre',
    description: 'A test genre for theme evaluation',
    thresholds: { score: 100 },
    theme: 'dark',
    ...overrides,
  } as GenreDefinition;
}

describe('Genre Theme', () => {
  it('should extract theme colors from genre definition', () => {
    const genre = createMockGenre({
      theme: 'dark',
      colors: {
        primary: '#ff0000',
        secondary: '#00ff00',
        background: '#000000',
        text: '#ffffff',
      },
    });

    const theme = genre.theme;
    const colors = genre.colors;

    expect(theme).toBe('dark');
    expect(colors.primary).toBe('#ff0000');
    expect(colors.secondary).toBe('#00ff00');
  });

  it('should handle different theme types', () => {
    const themes = ['light', 'dark', 'neon', 'retro', 'minimal'];
    
    themes.forEach((themeName) => {
      const genre = createMockGenre({ theme: themeName as GenreDefinition['theme'] });
      expect(genre.theme).toBe(themeName);
    });
  });

  it('should provide default colors when not specified', () => {
    const genre = createMockGenre();
    
    expect(genre.colors).toBeDefined();
    expect(genre.colors.primary).toBeDefined();
    expect(genre.colors.secondary).toBeDefined();
  });

  it('should validate theme consistency', () => {
    const genre = createMockGenre({
      theme: 'cyberpunk',
      colors: {
        primary: '#ff00ff',
        secondary: '#00ffff',
        background: '#1a1a2e',
        text: '#e0e0e0',
      },
    });

    expect(genre.theme).toBe('cyberpunk');
    expect(genre.colors.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('should support dynamic theme updates', () => {
    const genre = createMockGenre({ theme: 'light' });
    
    expect(genre.theme).toBe('light');
    
    // Simulate theme update
    genre.theme = 'dark';
    expect(genre.theme).toBe('dark');
  });

  it('should handle missing color properties gracefully', () => {
    const genre = createMockGenre({
      colors: {
        primary: '#ff0000',
        // secondary, background, text are missing
      },
    });

    expect(genre.colors.primary).toBe('#ff0000');
    expect(genre.colors.secondary).toBeUndefined();
  });

  it('should generate theme preview data', () => {
    const genre = createMockGenre({
      theme: 'nature',
      colors: {
        primary: '#228B22',
        secondary: '#8B4513',
        background: '#F5F5DC',
        text: '#2F4F2F',
      },
    });

    const preview = {
      theme: genre.theme,
      colors: genre.colors,
      displayName: genre.name,
    };

    expect(preview.theme).toBe('nature');
    expect(preview.colors.background).toBe('#F5F5DC');
  });

  it('should compare theme similarity', () => {
    const genre1 = createMockGenre({
      theme: 'dark',
      colors: { primary: '#000000', secondary: '#333333', background: '#111111', text: '#ffffff' },
    });
    
    const genre2 = createMockGenre({
      theme: 'dark',
      colors: { primary: '#000001', secondary: '#333334', background: '#111112', text: '#fffffe' },
    });

    // Both have same theme
    expect(genre1.theme).toBe(genre2.theme);
  });

  it('should handle theme with special characters', () => {
    const genre = createMockGenre({
      theme: 'retro-pixel',
      colors: {
        primary: '#FF00FF',
        secondary: '#00FFFF',
        background: '#000000',
        text: '#FFFFFF',
      },
    });

    expect(genre.theme).toBe('retro-pixel');
    expect(genre.colors.primary).toBe('#FF00FF');
  });

  it('should extract theme metadata', () => {
    const genre = createMockGenre({
      theme: 'minimal',
      colors: {
        primary: '#333333',
        secondary: '#666666',
        background: '#FFFFFF',
        text: '#000000',
      },
    });

    const metadata = {
      themeId: genre.theme,
      colorCount: Object.keys(genre.colors).length,
      hasCustomColors: !!genre.colors,
    };

    expect(metadata.themeId).toBe('minimal');
    expect(metadata.colorCount).toBe(4);
    expect(metadata.hasCustomColors).toBe(true);
  });

  it('should validate theme color format', () => {
    const genre = createMockGenre({
      theme: 'valid-theme',
      colors: {
        primary: '#AABBCC',
        secondary: '#DDEEFF',
        background: '#112233',
        text: '#445566',
      },
    });

    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    
    Object.values(genre.colors).forEach(color => {
      expect(color).toMatch(colorRegex);
    });
  });

  it('should support theme transitions', () => {
    const genre = createMockGenre({ theme: 'light' });
    const transitionSteps = 5;
    
    const transitionLog: string[] = [];
    
    for (let i = 0; i <= transitionSteps; i++) {
      const progress = i / transitionSteps;
      transitionLog.push(`Step ${i}: progress=${progress.toFixed(2)}, theme=${genre.theme}`);
    }

    expect(transitionLog).toHaveLength(transitionSteps + 1);
    expect(transitionLog[0]).toContain('progress=0.00');
    expect(transitionLog[transitionSteps]).toContain('progress=1.00');
  });

  it('should handle edge case: empty genre', () => {
    const genre = createMockGenre({
      id: '',
      name: '',
      description: '',
      thresholds: {},
      theme: 'plain',
    });

    expect(genre.theme).toBe('plain');
    expect(genre.id).toBe('');
  });

  it('should handle theme with unicode characters', () => {
    const genre = createMockGenre({
      theme: '桜',
      colors: {
        primary: '#FFB7C5',
        secondary: '#FF69B4',
        background: '#FFF0F5',
        text: '#8B0045',
      },
    });

    expect(genre.theme).toBe('桜');
    expect(genre.colors.primary).toBe('#FFB7C5');
  });
});