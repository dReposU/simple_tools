- [] Update index of the references [1], [2], ...
- [] Given a .md (or maybe can be an integrated extension) search for citations. Citations must follow this format _[#]_ where # is a number. Also these must be before a given heading like `# References`. When updating the index the program must be aware of citations.  

**Input:**  
As said in \_[2]\_.  

\# References  
[1] F   
[] G     
[2] I  

**Output:**  
As said in \_[3]\_.  

\# References  
[1] F   
[2] G   
[3] I  

- [] Changing order of references. 

Given  
[1] F   
[2] G   
[] H   
[3] I   

Spaces will be considered as places to insert, i.e.

_Pos 0_  
[1] F  
_Pos 1_  
[2] G  
_Pos 2_  
[] H  
_Pos 3_  
[3] I  
_Pos 4_  

**Alternative 1**. Staging the changes.  
The syntax must be `-1` and there can be a suborder like `-1.0`. E.g.

**Input:**  
As said in \_[3]\_.

[1-4] F  
[2-0.2] G  
[] H  
[3-0.1] I 

**Output:**  
As said in \_[1]\_.

[1] I  
[2] G   
[3] H  
[4] F  

**Alternative 2 (best):** Changing them with alt + and number them automatically.  
**Input:**  
As said in \_[3]\_.

[3] I 
[2] G  
[] H  
[1] F  

**Output:**  
As said in \_[1]\_.

[1] I  
[2] G   
[3] H  
[4] F  

- [] Making an extension for VSC