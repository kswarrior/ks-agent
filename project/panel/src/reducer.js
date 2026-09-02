import { actionTypes } from './types'

const {
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
} = actionTypes

const initialState = {
  isAuthenticated: false,
  currentUser: null,
  isLoggingIn: false,
  isLoading: false,
  isLoadingFiles: false,
  sidebarOpen: true,
  serverStatus: { state: 'stopped', running: false, pid: null },
  consoleLogs: [],
  selectedFile: null,
  players: [],
  files: [],
  properties: { error: null, loading: false },
  propertiesLoading: false,
}

export default function reducer(state = initialState, action) {
  switch (action.type) {
    case SET_CURRENT_USER:
      return {
        ...state,
        isAuthenticated: !!action.payload,
        currentUser: action.payload || null,
      }
    case LOGIN_START:
      return { ...state, isLoggingIn: true }
    case LOGIN_SUCCESS:
      return {
        ...state,
        isAuthenticated: true,
        currentUser: action.payload,
        isLoggingIn: false,
      }
    case LOGIN_FAILURE:
      return { ...state, isLoggingIn: false, loginError: action.payload }
    case LOGOUT:
      return { ...state, isAuthenticated: false, currentUser: null }
    case SET_LOADING:
      return { ...state, isLoading: action.payload }
    case TOGGLE_SIDEBAR:
      return { ...state, sidebarOpen: !state.sidebarOpen }
    case SET_SERVER_STATUS:
      return { ...state, serverStatus: action.payload }
    case SET_CONSOLE_LOG:
      return { ...state, consoleLogs: [action.payload] }
    case ADD_CONSOLE_LOG:
      return {
        ...state,
        consoleLogs: [...state.consoleLogs, action.payload].filter(
          (line, idx) => idx < 100
        ),
      }
    case CLEAR_CONSOLE:
      return { ...state, consoleLogs: [] }
    case SET_PLAYERS:
      return { ...state, players: action.payload }
    case SET_FILES:
      return { ...state, files: action.payload }
    case SET_LOADING_FILES:
      return { ...state, isLoadingFiles: action.payload }
    case SET_SELECTED_FILE:
      return { ...state, selectedFile: action.payload }
    case CLEAR_SELECTED_FILE:
      return { ...state, selectedFile: null }
    case UPDATE_PROPERTIES:
      return { ...state, properties: { ...state.properties, ...action.payload }, propertiesLoading: action.propertiesLoading }
    case SET_PROP_LOADING:
      return { ...state, propertiesLoading: action.payload }
    default:
      return state
  }
}