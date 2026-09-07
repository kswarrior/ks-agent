import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { About } from './pages/About';
import { Docs } from './pages/Docs';
export default function App() { return _jsxs("div", { className: "app", children: [_jsx(Sidebar, {}), _jsxs("div", { className: "main", children: [_jsx(Header, {}), _jsx("div", { className: "content", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/about", element: _jsx(About, {}) }), _jsx(Route, { path: "/docs", element: _jsx(Docs, {}) })] }) })] })] }); }
