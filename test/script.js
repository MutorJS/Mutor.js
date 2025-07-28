import { mount } from "../src/core/render.js";
import { effect, reactive } from "../src/core/state.js";

const state = reactive({ todos: ["Eat", "Sleep", "Code"], newTodo: "" });
effect(() => console.log(state.todos));

const Form = {
	tagname: "form",
	children: [
		{
			tagname: "input",
			attributes: {
				value: () => state.newTodo,
			},
			events: {
				input: (e) => {
					state.newTodo = e.target.value;
				},
			},
		},
		{ tagname: "button", attributes: { text: "Add Todo" } },
	],
	events: {
		submit: (e) => {
			e.preventDefault();
			const newTodo = state.newTodo.trim();
			if (newTodo) state.todos = [...state.todos, newTodo];
			state.newTodo = "";
		},
	},
};

const TodoList = {
	tagname: "ul",
	children: () =>
		state.todos.map((todo) => ({
			key: todo,
			tagname: "li",
			attributes: { text: todo },
		})),
};

const TodoApp = {
	children: () => [null, Form, TodoList],
};

const start = performance.now();
console.log(mount(TodoApp, document.getElementById("app")));
console.log(`App mounted in ${performance.now() - start}ms`);
