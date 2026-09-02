import { useState } from 'react'
import { loginStart, loginSuccess, loginFailure } from '../store/types'
import { useDispatch } from 'react-redux'
import { login } from '../api'

export function LoginPage({ navigate }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin')
  const [error, setError] = useState('')
  const dispatch = useDispatch()

  const handleLogin = async (e) => {
    e.preventDefault()
    dispatch(loginStart())
    try {
      const { token } = await login('/login', { username, password })
      dispatch(loginSuccess(token))
      navigate('/dashboard')
    } catch (err) {
      dispatch(loginFailure(err.message))
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>MC Panel Login</h2>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">Log in</button>
        </form>
      </div>
    </div>
  )
}