import React, { createContext, useContext, useEffect, useState } from 'react';

interface AccessibilityContextType {
  highContrast: boolean;
  fontSize: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
  screenReader: boolean;
  toggleHighContrast: () => void;
  setFontSize: (size: 'small' | 'medium' | 'large') => void;
  toggleReducedMotion: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
};

interface Props {
  children: React.ReactNode;
}

export const AccessibilityProvider: React.FC<Props> = ({ children }) => {
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    // Load preferences from localStorage
    const savedPrefs = localStorage.getItem('accessibility-preferences');
    if (savedPrefs) {
      const prefs = JSON.parse(savedPrefs);
      setHighContrast(prefs.highContrast || false);
      setFontSize(prefs.fontSize || 'medium');
      setReducedMotion(prefs.reducedMotion || false);
    }

    // Detect system preferences
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(prefersReducedMotion.matches);

    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)');
    setHighContrast(prefersHighContrast.matches);

    // Detect screen reader
    const detectScreenReader = () => {
      const isScreenReader = window.navigator.userAgent.includes('NVDA') ||
                           window.navigator.userAgent.includes('JAWS') ||
                           window.speechSynthesis?.getVoices().length > 0;
      setScreenReader(isScreenReader);
    };

    detectScreenReader();
    
    // Listen for changes
    prefersReducedMotion.addEventListener('change', (e) => setReducedMotion(e.matches));
    prefersHighContrast.addEventListener('change', (e) => setHighContrast(e.matches));

    return () => {
      prefersReducedMotion.removeEventListener('change', (e) => setReducedMotion(e.matches));
      prefersHighContrast.removeEventListener('change', (e) => setHighContrast(e.matches));
    };
  }, []);

  useEffect(() => {
    // Apply accessibility classes to document
    const root = document.documentElement;
    
    // High contrast
    if (highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Font size
    root.classList.remove('font-small', 'font-medium', 'font-large');
    root.classList.add(`font-${fontSize}`);

    // Reduced motion
    if (reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }

    // Save preferences
    const prefs = { highContrast, fontSize, reducedMotion };
    localStorage.setItem('accessibility-preferences', JSON.stringify(prefs));
  }, [highContrast, fontSize, reducedMotion]);

  const toggleHighContrast = () => setHighContrast(!highContrast);
  const toggleReducedMotion = () => setReducedMotion(!reducedMotion);

  const value = {
    highContrast,
    fontSize,
    reducedMotion,
    screenReader,
    toggleHighContrast,
    setFontSize,
    toggleReducedMotion,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
};

// Accessibility toolbar component
export const AccessibilityToolbar: React.FC = () => {
  const {
    highContrast,
    fontSize,
    reducedMotion,
    toggleHighContrast,
    setFontSize,
    toggleReducedMotion,
  } = useAccessibility();

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Open accessibility settings"
        aria-expanded={isOpen}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-16 right-0 bg-white rounded-lg shadow-xl border p-4 w-64">
          <h3 className="text-lg font-semibold mb-4">Accessibility Settings</h3>
          
          <div className="space-y-4">
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={highContrast}
                  onChange={toggleHighContrast}
                  className="mr-2"
                />
                High Contrast
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Font Size</label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as 'small' | 'medium' | 'large')}
                className="w-full p-2 border rounded"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={toggleReducedMotion}
                  className="mr-2"
                />
                Reduce Motion
              </label>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="mt-4 w-full bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
