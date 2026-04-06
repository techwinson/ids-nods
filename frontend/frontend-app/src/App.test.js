import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders login view", () => {
  render(<App />);
  const heading = screen.getByText(/welcome back|create account/i);
  expect(heading).toBeInTheDocument();
});
