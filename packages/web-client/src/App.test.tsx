import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders home title', () => {
    render(<App />);
    expect(screen.getByText('血与刃的白蔷薇')).toBeInTheDocument();
  });
});
