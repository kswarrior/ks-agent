"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sidebar = Sidebar;
var react_router_dom_1 = require("react-router-dom");
function Sidebar() { return <aside className="sidebar"><h1>Acme</h1><nav className="nav"><react_router_dom_1.NavLink to="/" end className={function (_a) {
    var isActive = _a.isActive;
    return isActive ? 'active' : '';
}}>Dashboard</react_router_dom_1.NavLink><react_router_dom_1.NavLink to="/about" className={function (_a) {
    var isActive = _a.isActive;
    return isActive ? 'active' : '';
}}>About</react_router_dom_1.NavLink><react_router_dom_1.NavLink to="/docs" className={function (_a) {
    var isActive = _a.isActive;
    return isActive ? 'active' : '';
}}>Docs</react_router_dom_1.NavLink></nav></aside>; }
