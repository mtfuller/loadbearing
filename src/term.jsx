import React from 'react';
import { GLOSSARY } from './examples-meta.js';

// A term with a short definition shown on hover or keyboard focus.
export function Term({ k, children }) {
  const text = GLOSSARY[k];
  if (!text) return children;
  return (
    <span className="term" tabIndex={0}>
      {children}
      <span className="term-tip" role="tooltip">{text}</span>
    </span>
  );
}
