using my.bookshop as my from '../db/schema';

service CatalogService {

  @readonly
  @mcp: {
    name       : 'books',
    description: 'Book data list',
    resource   : [
      'filter',
      'orderby',
      'select',
      'skip',
      'top'
    ]
  }
  entity Books            as projection on my.Books;

  extend projection Books with actions {
    @mcp: {
      name       : 'get-stock',
      description: 'Retrieves stock from a given book',
      tool       : true
    }
    function getStock() returns Integer;
  }

  @mcp: {
    name       : 'authors',
    description: 'Author data list',
    //resource   : true // In case we just want to enable all options
    resource   : true
  }
  entity Authors          as projection on my.Authors;

  entity MultiKeyExamples as projection on my.MultiKeyExample;

  extend projection MultiKeyExamples with actions {
    @mcp: {
      name       : 'get-multi-key',
      description: 'Gets multi key entity from database',
      tool       : true
    }
    function getMultiKey() returns String;
  }

  @mcp: {
    name       : 'get-author',
    description: 'Gets the desired author',
    tool       : true
  }
  function getAuthor(input : String)             returns String;

  @mcp: {
    name       : 'books-by-author',
    description: 'Gets a list of books made by the author',
    tool       : true
  }
  function getBooksByAuthor(authorName : String) returns array of String;

  @mcp: {
    name       : 'book-recommendation',
    description: 'Get a random book recommendation',
    tool       : true
  }
  function getBookRecommendation()               returns String;

}

annotate CatalogService with @mcp.prompts: [{
  name       : 'give-me-book-abstract',
  title      : 'Book Abstract',
  description: 'Gives an abstract of a book based on the title',
  template   : 'Search the internet and give me an abstract of the book {{book-id}}',
  role       : 'user',
  inputs     : [{
    key : 'book-id',
    type: 'String'
  }]
}];
