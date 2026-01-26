const cds = require("@sap/cds");
const logger = cds.log();

class CatalogService extends cds.ApplicationService {
  init() {
    super.init();
    const { Books } = cds.entities;

    this.on("getAuthor", async (req) => {
      return `Hello, I'm not the author but I could be. You searched for: ${req.data.id}`;
    });

    this.on("getAuthorDetails", async (req) => {
      logger.info("Hello there, you have the following credentials", req.user);
      return req.user.id;
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

    this.on("getBooksByDate", async (req) => {
      // This handler validates that date parameters are received correctly
      const { publishDate, updatedAfter, createdAfter } = req.data;
      return [
        `publishDate: ${publishDate}`,
        `updatedAfter: ${updatedAfter}`,
        `createdAfter: ${createdAfter}`,
      ];
    });
  }
}

module.exports = CatalogService;
