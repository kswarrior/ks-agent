// Action type constants
export const SET_CURRENT_USER = 'SET_CURRENT_USER'
export const LOGIN_START = 'LOGIN_START'
export const LOGIN_SUCCESS = 'LOGIN_SUCCESS'
export const LOGIN_FAILURE = 'LOGIN_FAILURE'
export const LOGOUT = 'LOGOUT'
export const SET_LOADING = 'SET_LOADING'
export const TOGGLE_SIDEBAR = 'TOGGLE_SIDEBAR'
export const SET_SERVER_STATUS = 'SET_SERVER_STATUS'
export const SET_CONSOLE_LOG = 'SET_CONSOLE_LOG'
export const ADD_CONSOLE_LOG = 'ADD_CONSOLE_LOG'
export const CLEAR_CONSOLE = 'CLEAR_CONSOLE'
export const SET_PLAYERS = 'SET_PLAYERS'
export const SET_FILES = 'SET_FILES'
export const SET_LOADING_FILES = 'SET_LOADING_FILES'
export const SET_SELECTED_FILE = 'SET_SELECTED_FILE'
export const CLEAR_SELECTED_FILE = 'CLEAR_SELECTED_FILE'
export const UPDATE_PROPERTIES = 'UPDATE_PROPERTIES'
export const SET_PROP_LOADING = 'SET_PROP_LOADING'

// Export as objects for convenience
export const types = {
  SET_CURRENT_USER,
  LOGIN_START,
  LOGIN_SUCCESS,
  LOGIN_FAILURE,
  LOGOUT,
  SET_LOADING,
  TOGGLE_SIDEBAR,
  SET_SERVER_STATUS,
  SET_CONSOLE_LOG,
  ADD_CONSOLE_LOG,
  CLEAR_CONSOLE,
  SET_PLAYERS,
  SET_FILES,
  SET_LOADING_FILES,
  SET_SELECTED_FILE,
  CLEAR_SELECTED_FILE,
  UPDATE_PROPERTIES,
  SET_PROP_LOADING,
}

export const actionTypes = {
  SET_CURRENT_USER,
  LOGIN_START,
  LOGIN_SUCCESS,
  LOGIN_FAILURE,
  LOGOUT,
  SET_LOADING,
  TOGGLE_SIDEBAR,
  SET_SERVER_STATUS,
  SET_CONSOLE_LOG,
  ADD_CONSOLE_LOG,
  CLEAR_CONSOLE,
  SET_PLAYERS,
  SET_FILES,
  SET_LOADING_FILES,
  SET_SELECTED_FILE,
  CLEAR_SELECTED_FILE,
  UPDATE_PROPERTIES,
  SET_PROP_LOADING,
}

// Action creators
export function setCurrentUser(payload) {
  return { type: SET_CURRENT_USER, payload }
}

export function loginStart() {
  return { type: LOGIN_START }
}

export function loginSuccess(payload) {
  return { type: LOGIN_SUCCESS, payload }
}

export function loginFailure(error) {
  return { type: LOGIN_FAILURE, payload: error }
}

export function logout() {
  return { type: LOGOUT }
}

export function setLoading(loading) {
  return { type: SET_LOADING, payload: loading }
}

export function toggleSidebar() {
  return { type: TOGGLE_SIDEBAR }
}

export function setServerStatus(status) {
  return { type: SET_SERVER_STATUS, payload: status }
}

export function setConsoleLog(line) {
  return { type: SET_CONSOLE_LOG, payload: line }
}

export function addConsoleLog(line) {
  return { type: ADD_CONSOLE_LOG, payload: line }
}

export function clearConsole() {
  return { type: CLEAR_CONSOLE }
}

export function setPlayers(players) {
  return { type: SET_PLAYERS, payload: players }
}

export function setFiles(files) {
  return { type: SET_FILES, payload: files }
}

export function setLoadingFiles(loading) {
  return { type: SET_LOADING_FILES, payload: loading }
}

export function setSelectedFile(file) {
  return { type: SET_SELECTED_FILE, payload: file }
}

export function clearSelectedFile() {
  return { type: CLEAR_SELECTED_FILE }
}

export function updateProperties(payload, propertiesLoading) {
  return { type: UPDATE_PROPERTIES, payload, propertiesLoading }
}

export function setPropLoading(loading) {
  return { type: SET_PROP_LOADING, payload: loading }
}