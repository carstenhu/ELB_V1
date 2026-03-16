import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Section(props) {
    return (_jsxs("section", { className: "section", children: [props.title ? (_jsx("div", { className: "section__header", children: _jsx("h2", { children: props.title }) })) : null, _jsx("div", { className: "section__content", children: props.children })] }));
}
export function Field(props) {
    return (_jsxs("label", { className: `field${props.full ? " field--full" : ""}`, children: [_jsx("span", { children: props.label }), props.children] }));
}
