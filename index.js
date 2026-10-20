/**
 * Host half of the dsh-deepseek-cny-cost bundle.
 *
 * The bundle contributes browser presentation only: the cost pill reads the
 * session's existing `tokenUsage` / `modelSelection` projections and needs no
 * Host work. This empty `apply()` exists so the Loader has a host-side row for
 * the package, which is what makes the client module system pick up the
 * package's `dsh.client` declaration and serve `./client` to the page.
 */
export function apply() {}
