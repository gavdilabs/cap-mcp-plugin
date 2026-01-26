namespace my.bookshop;

entity Books {
  key ID            : Integer   @mcp.hint: 'Must be a unique number not already in the system';
      title         : String;
      stock         : Integer   @mcp.hint: 'The amount of books currently on store shelves';
      computedValue : Integer   @Core.Computed;
      secretMessage : String    @mcp.omit;
      publishDate   : Date      @mcp.hint: 'Publication date in ISO 8601 format (YYYY-MM-DD)';
      lastUpdated   : DateTime  @mcp.hint: 'Last update timestamp in ISO 8601 format';
      createdAt     : Timestamp @mcp.hint: 'Creation timestamp (ISO 8601 or epoch milliseconds)';
      author        : Association to Authors;
}

entity Authors {
  key ID    : Integer;
      name  : String @mcp.hint: 'Full name of the author';
      books : Association to many Books
                on books.author = $self;
}

entity MultiKeyExample {
  key ID          : Integer;
  key ExternalKey : Integer;
      description : String;
}

type TValidQuantities {
  positiveOnly : TMyNumbers:anInteger  @assert.range: [
    0,
    _
  ]  @mcp.hint: 'Only takes in positive numbers, i.e. no negative values such as -1'
};

type TMyNumbers {
  anInteger : Integer
};

type ComplexType {
  rangedNumber : Integer @assert.range: [
    0,
    10
  ];
}
