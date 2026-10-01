export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        message: "Your Worker is running."
      });
    }

    return env.ASSETS.fetch(request);
  }
};
