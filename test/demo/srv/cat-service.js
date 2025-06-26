const cds = require("@sap/cds");

class CatalogService extends cds.ApplicationService {
  init() {
    super.init();
    const { Books } = cds.entities;

    this.on("getAuthor", async (req) => {
      return `Hello, I'm not the author but I could be. You searched for: ${req.data.input}`;
    });

    this.on("getBooksByAuthor", async (req) => {
      const books = await cds.run(
        SELECT.from(Books).where(`author.name like '%${req.data.authorName}%'`),
      );
      return books?.map((el) => el?.title);
    });

    this.on("getBookRecommendation", async (req) => {
      const query = SELECT.from(Books)
        .columns("title", "author.name")
        .orderBy("RANDOM()")
        .limit(1);
      const result = await cds.run(query);

      return `${result[0]?.title} - ${result[0]?.author_name}`;
    });

    this.on("getStock", "Books", async (req) => {
      const query = SELECT.from(Books, req.params[0]).columns("stock");

      const result = await cds.run(query);
      return result?.stock;
    });
  }
}

module.exports = CatalogService;
