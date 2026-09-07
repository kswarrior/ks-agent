import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { App } from './App'

describe('App console', () => {
  it('renders server name', () => {
    render(<App />)
    expect(screen.getByText(/Survival Hub/i)).toBeInTheDocument()
  })

  it('sends command on Enter and clears input', async () => {
    render(<App />)
    const input = screen.getByPlaceholderText(/RCON command/i)
    fireEvent.change(input, { target: { value: 'say hi' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(input).toHaveValue('')
    // history renders command
    expect(await screen.findByText(/say hi/)).toBeInTheDocument()
  })
})
