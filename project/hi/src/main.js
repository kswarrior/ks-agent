"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var client_1 = require("react-dom/client");
var react_router_dom_1 = require("react-router-dom");
var App_1 = require("./App");
require("./styles.css");
(0, client_1.createRoot)(document.getElementById('root')).render(<react_1.default.StrictMode><react_router_dom_1.BrowserRouter><App_1.default /></react_router_dom_1.BrowserRouter></react_1.default.StrictMode>);
