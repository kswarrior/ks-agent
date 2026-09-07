"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
var react_router_dom_1 = require("react-router-dom");
var Sidebar_1 = require("./components/Sidebar");
var Header_1 = require("./components/Header");
var Dashboard_1 = require("./pages/Dashboard");
var About_1 = require("./pages/About");
var Docs_1 = require("./pages/Docs");
function App() { return <div className="app"><Sidebar_1.Sidebar /><div className="main"><Header_1.Header /><div className="content"><react_router_dom_1.Routes><react_router_dom_1.Route path="/" element={<Dashboard_1.Dashboard />}/><react_router_dom_1.Route path="/about" element={<About_1.About />}/><react_router_dom_1.Route path="/docs" element={<Docs_1.Docs />}/></react_router_dom_1.Routes></div></div></div>; }
