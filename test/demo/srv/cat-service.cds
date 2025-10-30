using my.bookshop as my from '../db/schema';

service CatalogService {

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

  // Wrap Books entity as tools for query/get/create/update (demo)
  annotate CatalogService.Books with @mcp.wrap: {
    tools: true,
    modes: [
      'query',
      'get',
      'create',
      'update',
      'delete'
    ],
    hint : 'Use for read and write demo operations'
  };

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

  extend my.Authors with {
    nominations : array of String @mcp.hint: 'Awards that the author has been nominated for';
  };

  annotate CatalogService.Authors with @mcp.wrap: {
    tools: true,
    modes: [
      'query',
      'get',
      'create',
      'update'
    ],
    hint : {
      query : 'Retrieves lists of data based on the query parameters provided',
      get   : 'Retrieves a singular entity',
      create: 'Creates a new record of an Author',
      update: 'Update properties of a given author'
    }
  };

  @restrict: [
    {
      grant: ['READ'],
      to   : ['read-role']
    },
    {
      grant: [
        'CREATE',
        'UPDATE'
      ],
      to   : ['maintainer']
    },
    {
      grant: ['*'],
      to   : ['admin']
    }
  ]
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
    tool       : true,
    elicit     : ['input'] // Ask for the function import's input to be elicited
  }
  function getAuthor(id : String)                                                                                  returns String;

  @requires: 'author-specialist'
  @mcp     : {
    name       : 'get-author-details',
    description: 'Gets the desired authors details',
    tool       : true
  }
  function getAuthorDetails()                                                                                      returns String;

  annotate getAuthor with @requires: 'book-keeper';

  @mcp: {
    name       : 'books-by-author',
    description: 'Gets a list of books made by the author',
    tool       : true,
    elicit     : [
      'input',
      'confirm'
    ] // Ask for the function import's input to be elicited
  }
  function getBooksByAuthor(authorName : String @mcp.hint:'Full name of the author you want to get the books of' ) returns array of String;

  @mcp: {
    name       : 'book-recommendation',
    description: 'Get a random book recommendation',
    tool       : true
  }
  function getBookRecommendation()                                                                                 returns String;

  @mcp: {
    name       : 'get-many-authors',
    description: 'Gets many authors. Using for testing "many"',
    tool       : true
  }
  function getManyAuthors(ids : array of String)                                                                   returns many String;


  @mcp: {
    name       : 'check-author-name',
    description: 'Not implemented, just a test for parser',
    tool       : true
  }
  function checkAuthorName(value : my.ComplexType:rangedNumber)                                                    returns String;

  @mcp: {
    name       : 'not-real-tool',
    description: 'Not real, just used for nested types. Do not use',
    tool       : true
  }
  function getNotReal(value : my.TValidQuantities:positiveOnly)                                                    returns String;
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

service AdminService {

  @mcp: {
    name       : 'admin-books',
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

  // Wrap Books entity as tools for query/get/create/update (demo)
  annotate CatalogService.Books with @mcp.wrap: {
    tools: true,
    modes: [
      'query',
      'get',
      'create',
      'update',
      'delete'
    ],
    hint : 'Use for read and write demo operations'
  };

  @mcp: {
    name       : 'book-recommendation-admin-service',
    description: 'Get a random book recommendation',
    tool       : true
  }
  function getBookRecommendation() returns String;

  extend projection Books with actions {
    @mcp: {
      name       : 'get-stock-as-admin',
      description: 'Retrieves stock from a given book',
      tool       : true
    }
    function getStock() returns Integer;
  }
}
