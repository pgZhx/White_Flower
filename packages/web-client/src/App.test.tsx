import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => cleanup());

  it('renders home title', () => {
    render(<App />);
    expect(screen.getByText('血与刃的白蔷薇')).toBeInTheDocument();
  });

  it('does not reconnect a stale room remembered by an older build', () => {
    window.localStorage.setItem('white-flower:last-peer-room', 'STALE1');
    render(<App />);

    expect(screen.getByText('血与刃的白蔷薇')).toBeInTheDocument();
    expect(screen.queryByText(/正在重新连接房间/)).not.toBeInTheDocument();
  });
});
