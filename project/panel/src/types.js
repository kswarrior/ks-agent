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
  SET_CURRENT_USER: 'SET_CURRENT_USER',
  LOGIN_START: 'LOGIN_START',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  SET_LOADING: 'SET_LOADING',
  TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
  SET_SERVER_STATUS: 'SET_SERVER_STATUS',
  SET_CONSOLE_LOG: 'SET_CONSOLE_LOG',
  ADD_CONSOLE_LOG: 'ADD_CONSOLE_LOG',
  CLEAR_CONSOLE: 'CLEAR_CONSOLE',
  SET_PLAYERS: 'SET_PLAYERS',
  SET_FILES: 'SET_FILES',
  SET_LOADING_FILES: 'SET_LOADING_FILES',
  SET_SELECTED_FILE: 'SET_SELECTED_FILE',
  CLEAR_SELECTED_FILE: 'CLEAR_SELECTED_FILE',
  UPDATE_PROPERTIES: 'UPDATE_PROPERTIES',
  SET_PROP_LOADING: 'SET_PROP_LOADING',
}

// Action creators
export function setCurrentUser(payload) {
  return { type: types.SET_CURRENT_USER, payload }
}

export function loginStart() {
  return { type: types.LOGIN_START }
}

export function loginSuccess(payload) {
  return { type: types.LOGIN_SUCCESS, payload }
}

export function loginFailure(error) {
  return { type: types.LOGIN_FAILURE, payload: error }
}

export function logout() {
  return { type: types.LOGOUT }
}

export function setLoading(loading) {
  return { type: types.SET_LOADING, payload: loading }
}

export function toggleSidebar() {
  return { type: types.TOGGLE_SIDEBAR }
}

export function setServerStatus(status) {
  return { type: types.SET_SERVER_STATUS, payload: status }
}

export function setConsoleLog(line) {
  return { type: types.SET_CONSOLE_LOG, payload: line }
}

export function addConsoleLog(line) {
  return { type: types.ADD_CONSOLE_LOG, payload: line }
}

export function clearConsole() {
  return { type: types.CLEAR_CONSOLE }
}

export function setPlayers(players) {
  return { type: types.SET_PLAYERS, payload: players }
}

export function setFiles(files) {
  return { type: types.SET_FILES, payload: files }
}

export function setLoadingFiles(loading) {
  return { type: types.SET_LOADING_FILES, payload: loading }
}

export function setSelectedFile(file) {
  return { type: types.SET_SELECTED_FILE, payload: file }
}

export function clearSelectedFile() {
  return { type: types.CLEAR_SELECTED_FILE }
}

export function updateProperties(payload, propertiesLoading) {
  return { type: types.UPDATE_PROPERTIES, payload, propertiesLoading }
}

export function setPropLoading(loading) {
  return { type: types.SET_PROP_LOADING, payload: loading }
}